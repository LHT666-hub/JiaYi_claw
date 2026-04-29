import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { AskReply, KnowledgeSnippet } from "@/lib/types";
import {
  getFallbackAskReply,
  getGreetingReply,
  getGuardrailReply,
  normalizeQuestion,
} from "@/lib/faq";
import {
  buildClarifyReply,
  buildKnowledgeFallbackReply,
  buildKnowledgePrompt,
  retrieveKnowledge,
} from "@/lib/knowledge";

export const runtime = "nodejs";

const kimiSystemPrompt =
  "你是“家医 Claw”，一个面向老年慢病居民的家庭医生服务导航与慢病科普助手。你不是医生，不能提供诊断、处方、停药、换药、剂量调整、检查报告严重程度判断或个体化治疗建议。你的主要工作不是自己创造事实，而是把已经检索到的公开信息、本地知识和流程材料，用老人更容易理解的话整理出来。回答要简明、温和、清楚，优先帮助居民知道下一步该做什么。";

const KIMI_CACHE_TTL_MS = 5 * 60 * 1000;
const KIMI_TIMEOUT_MS = 40_000;
const kimiCache = new Map<string, { expiresAt: number; reply: AskReply }>();
const kimiInFlight = new Map<string, Promise<AskReply>>();

function readEnvValue(name: "KIMI_API_KEY" | "KIMI_BASE_URL" | "KIMI_MODEL") {
  const value = process.env[name];
  return value ? value.trim().replace(/^['"]|['"]$/g, "") : "";
}

function pruneExpiredCache() {
  const now = Date.now();
  for (const [key, value] of kimiCache.entries()) {
    if (value.expiresAt <= now) {
      kimiCache.delete(key);
    }
  }
}

function getCachedKimiReply(cacheKey: string) {
  pruneExpiredCache();
  return kimiCache.get(cacheKey)?.reply ?? null;
}

function setCachedKimiReply(cacheKey: string, reply: AskReply) {
  kimiCache.set(cacheKey, {
    reply,
    expiresAt: Date.now() + KIMI_CACHE_TTL_MS,
  });
}

function buildCacheKey(question: string, snippets: KnowledgeSnippet[]) {
  return `${question}::${snippets.map((snippet) => snippet.id).join(",")}`;
}

function extractTextContent(content: unknown) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
      return "";
    })
    .join("")
    .trim();
}

function parseBoolean(text: string) {
  return /(是|建议联系家庭医生|true)/i.test(text);
}

function parseRiskLevel(text: string): AskReply["riskLevel"] {
  if (text.includes("emergency")) {
    return "emergency";
  }
  if (text.includes("high")) {
    return "high";
  }
  if (text.includes("medium")) {
    return "medium";
  }
  return "low";
}

function parseKimiReply(text: string, snippets: KnowledgeSnippet[]): AskReply {
  const trimmed = text.trim();
  const answerMatch = trimmed.match(/回答[:：]\s*([\s\S]*?)(?:\n\s*下一步建议[:：]|$)/);
  const nextStepMatch = trimmed.match(/下一步建议[:：]\s*([\s\S]*?)(?:\n\s*是否建议联系家庭医生[:：]|$)/);
  const suggestDoctorMatch = trimmed.match(/是否建议联系家庭医生[:：]\s*(.+?)(?:\n|$)/);
  const riskLevelMatch = trimmed.match(/风险等级[:：]\s*(.+?)(?:\n|$)/);

  return {
    answer: answerMatch?.[1]?.trim() || trimmed,
    nextStep:
      nextStepMatch?.[1]?.trim() ||
      snippets[0]?.nextStep ||
      "如果您仍然拿不准，建议联系家庭医生或社区卫生服务中心进一步确认。",
    suggestDoctor: parseBoolean(suggestDoctorMatch?.[1] ?? ""),
    riskLevel: parseRiskLevel((riskLevelMatch?.[1] ?? "").toLowerCase()),
    category: snippets[0]?.category ?? "知识整理",
    source: "kimi",
  };
}

function isRateLimitError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : null;
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message).toLowerCase()
      : "";

  return (
    status === 429 ||
    code === 429 ||
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  );
}

function isTimeoutError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  const name = typeof error === "object" && error !== null && "name" in error ? error.name : null;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message).toLowerCase()
      : "";

  return (
    code === "ETIMEDOUT" ||
    name === "AbortError" ||
    message.includes("kimi_timeout") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted")
  );
}

function isAuthError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : null;
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message).toLowerCase()
      : "";

  return (
    status === 401 ||
    code === 401 ||
    message.includes("401") ||
    message.includes("unauthorized") ||
    message.includes("invalid authentication")
  );
}

async function requestKimiReply(
  question: string,
  snippets: KnowledgeSnippet[],
  client: OpenAI,
  model: string,
) {
  const completion = (await Promise.race([
    client.chat.completions.create({
      model,
      temperature: 1,
      messages: [
        { role: "system", content: kimiSystemPrompt },
        { role: "user", content: buildKnowledgePrompt(question, snippets) },
      ],
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("KIMI_TIMEOUT")), KIMI_TIMEOUT_MS);
    }),
  ])) as OpenAI.Chat.Completions.ChatCompletion;

  const text = extractTextContent(completion.choices[0]?.message?.content);

  if (!text) {
    throw new Error("KIMI_EMPTY_REPLY");
  }

  return parseKimiReply(text, snippets);
}

async function getKnowledgeReply(question: string, snippets: KnowledgeSnippet[]) {
  const apiKey = readEnvValue("KIMI_API_KEY").replace(/^Bearer\s+/i, "");
  const fallbackReply = buildKnowledgeFallbackReply(question, snippets);

  if (!apiKey) {
    return fallbackReply;
  }

  const baseURL = readEnvValue("KIMI_BASE_URL") || "https://api.moonshot.cn/v1";
  const model = readEnvValue("KIMI_MODEL") || "kimi-k2.6";
  const cacheKey = buildCacheKey(question, snippets);
  const cachedReply = getCachedKimiReply(cacheKey);

  if (cachedReply) {
    return cachedReply;
  }

  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  const pendingReply =
    kimiInFlight.get(cacheKey) ??
    (async () => {
      const kimiReply = await requestKimiReply(question, snippets, client, model);
      setCachedKimiReply(cacheKey, kimiReply);
      return kimiReply;
    })();

  kimiInFlight.set(cacheKey, pendingReply);

  try {
    return await pendingReply;
  } catch (error) {
    if (isAuthError(error) || isRateLimitError(error) || isTimeoutError(error)) {
      return fallbackReply;
    }

    return fallbackReply;
  } finally {
    kimiInFlight.delete(cacheKey);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { question?: string };
    const question = typeof body.question === "string" ? body.question : "";
    const trimmedQuestion = question.trim();
    const normalizedQuestion = normalizeQuestion(question);

    if (!normalizedQuestion) {
      return NextResponse.json(getFallbackAskReply("unknown"));
    }

    const guardrailReply = getGuardrailReply(normalizedQuestion);
    if (guardrailReply) {
      return NextResponse.json(guardrailReply);
    }

    const greetingReply = getGreetingReply(normalizedQuestion);
    if (greetingReply) {
      return NextResponse.json(greetingReply);
    }

    const snippets = retrieveKnowledge(trimmedQuestion);

    if (!snippets.length) {
      return NextResponse.json(buildClarifyReply(trimmedQuestion));
    }

    const reply = await getKnowledgeReply(trimmedQuestion, snippets);
    return NextResponse.json(reply);
  } catch {
    return NextResponse.json(getFallbackAskReply("unknown"));
  }
}

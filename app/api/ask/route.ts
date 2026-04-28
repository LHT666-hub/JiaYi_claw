import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { AskReply } from "@/lib/types";
import {
  getBusyAskReply,
  getFallbackAskReply,
  getLocalAskReply,
  normalizeQuestion,
  shouldUseKimi,
} from "@/lib/faq";

const kimiSystemPrompt =
  "你是“家医 Claw”，一个面向老年慢病居民的家庭医生服务导航与慢病科普助手。你不是医生，不能提供诊断、处方、停药、换药、剂量调整、检查报告严重程度判断或个体化治疗建议。你只能回答家庭医生签约、体检流程、报告领取、配药规则、长处方、延伸处方、随访安排、转诊流程、慢病基础科普、平台任务积分、健康小组使用等问题。回答要简明、温和、适合老年居民理解。每次回答最后给出“下一步建议”。";

export const runtime = "nodejs";
const KIMI_CACHE_TTL_MS = 5 * 60 * 1000;
// Increase timeout to 40 seconds to accommodate occasional Kimi latency spikes.
const KIMI_TIMEOUT_MS = 40_000;
const kimiCache = new Map<string, { expiresAt: number; reply: AskReply }>();
const kimiInFlight = new Map<string, Promise<AskReply>>();

function readEnvValue(name: "KIMI_API_KEY" | "KIMI_BASE_URL" | "KIMI_MODEL") {
  const value = process.env[name];

  if (!value) {
    return "";
  }

  return value.trim().replace(/^['\"]|['\"]$/g, "");
}

function pruneExpiredCache() {
  const now = Date.now();

  for (const [key, value] of kimiCache.entries()) {
    if (value.expiresAt <= now) {
      kimiCache.delete(key);
    }
  }
}

function getCachedKimiReply(question: string) {
  pruneExpiredCache();
  const cached = kimiCache.get(question);

  if (!cached) {
    return null;
  }

  return cached.reply;
}

function setCachedKimiReply(question: string, reply: AskReply) {
  kimiCache.set(question, {
    reply,
    expiresAt: Date.now() + KIMI_CACHE_TTL_MS,
  });
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

function parseKimiReply(text: string): AskReply {
  const trimmed = text.trim();
  const segments = trimmed.split(/(?:\n|^)\s*下一步建议[:：]\s*/);
  const answer = segments[0]?.trim() || trimmed;
  const nextStep =
    segments.length > 1
      ? `下一步建议：${segments.slice(1).join(" ").trim()}`
      : "下一步建议：如果仍拿不准，建议联系家庭医生或社区卫生服务中心进一步确认。";

  return {
    answer,
    nextStep,
    suggestDoctor: false,
    riskLevel: "low",
    category: "Kimi 补充",
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { question?: string };
    const question = typeof body.question === "string" ? body.question : "";
    const normalizedQuestion = normalizeQuestion(question);

    if (!normalizedQuestion) {
      return NextResponse.json(getFallbackAskReply("unknown"));
    }

    const localReply = getLocalAskReply(normalizedQuestion);

    if (localReply) {
      return NextResponse.json(localReply);
    }

    if (!shouldUseKimi(normalizedQuestion)) {
      return NextResponse.json(getFallbackAskReply("out_of_scope"));
    }

    const cachedReply = getCachedKimiReply(normalizedQuestion);

    if (cachedReply) {
      return NextResponse.json(cachedReply);
    }

    const apiKey = readEnvValue("KIMI_API_KEY").replace(/^Bearer\s+/i, "");
    const baseURL = readEnvValue("KIMI_BASE_URL") || "https://api.moonshot.cn/v1";
    const model = readEnvValue("KIMI_MODEL") || "kimi-k2.6";

    if (!apiKey) {
      return NextResponse.json(getFallbackAskReply("no_env_key"));
    }

    const client = new OpenAI({
      apiKey,
      baseURL,
    });

    const pendingReply =
      kimiInFlight.get(normalizedQuestion) ??
      (async () => {
        const completion = (await Promise.race([
          client.chat.completions.create({
            model,
            temperature: 1,
            messages: [
              {
                role: "system",
                content: kimiSystemPrompt,
              },
              {
                role: "user",
                content: normalizedQuestion,
              },
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

        const kimiReply = parseKimiReply(text);
        setCachedKimiReply(normalizedQuestion, kimiReply);
        return kimiReply;
      })();

    kimiInFlight.set(normalizedQuestion, pendingReply);

    const kimiReply = await pendingReply.finally(() => {
      kimiInFlight.delete(normalizedQuestion);
    });

    return NextResponse.json(kimiReply);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({
        ...getFallbackAskReply("auth_error"),
        reason: "auth_error",
        answer:
          "API Key 未通过认证，请检查 .env.local 中的 KIMI_API_KEY 和 KIMI_BASE_URL",
        nextStep:
          "请确认 KIMI_API_KEY 和 KIMI_BASE_URL 配置正确后再重试。",
      });
    }

    if (isRateLimitError(error)) {
      return NextResponse.json(getBusyAskReply("rate_limit"));
    }

    if (isTimeoutError(error)) {
      return NextResponse.json(getBusyAskReply("timeout"));
    }

    const status =
      typeof error === "object" && error !== null && "status" in error
        ? error.status
        : null;
    const message =
      typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "";
    const reason = status !== null || message ? "kimi_error" : "unknown";

    return NextResponse.json(getFallbackAskReply(reason));
  }
}

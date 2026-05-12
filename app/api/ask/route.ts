import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { generateClawSummary } from "@/lib/clawSummary";
import { createAskLog } from "@/lib/db/askLogs";
import { createDoctorTodo } from "@/lib/db/doctorTodos";
import { getActiveFamilyBindingsForResident } from "@/lib/db/familyBindings";
import { getFaqs } from "@/lib/db/faqs";
import { createNotification } from "@/lib/db/notifications";
import { createTodoStatusEvent } from "@/lib/db/todoStatusEvents";
import {
  getFallbackAskReply,
  getGreetingReply,
  getGuardrailReply,
  getLocalAskReply,
  normalizeQuestion,
} from "@/lib/faq";
import { buildKnowledgePrompt, isInScope, searchKnowledge } from "@/lib/knowledge";
import { getServerAuthContext } from "@/lib/supabase/server-auth";
import type {
  AppRole,
  AskFallbackReason,
  AskReply,
  DemoDoctorTodo,
  KnowledgeItem,
  ProfileRow,
} from "@/lib/types";

export const runtime = "nodejs";

const knowledgeSystemPrompt =
  "你是“家医 Claw”，用于家庭医生服务导航与慢病科普信息。你不能提供诊断、处方、停药、换药、剂量调整、严重程度判断或个体化治疗建议。请优先依据给定知识片段回答，并在最后给出下一步建议。";

const generalSystemPrompt =
  "你是“家医 Claw”，只提供家庭医生服务导航、流程解释和一般性慢病科普信息。你不能提供诊断、处方、停药、换药、剂量调整或个体化治疗建议。";

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
  if (text.includes("emergency")) return "emergency";
  if (text.includes("high")) return "high";
  if (text.includes("medium")) return "medium";
  return "low";
}

function parseStructuredReply(
  text: string,
  fallback: {
    category: string;
    nextStep: string;
    source: AskReply["source"];
    knowledgeIds?: string[];
  },
): AskReply {
  const trimmed = text.trim();
  const answerMatch = trimmed.match(/回答[:：]\s*([\s\S]*?)(?:\n\s*下一步建议[:：]|$)/);
  const nextStepMatch = trimmed.match(
    /下一步建议[:：]\s*([\s\S]*?)(?:\n\s*是否建议联系家庭医生[:：]|$)/,
  );
  const suggestDoctorMatch = trimmed.match(/是否建议联系家庭医生[:：]\s*(.+?)(?:\n|$)/);
  const riskLevelMatch = trimmed.match(/风险等级[:：]\s*(.+?)(?:\n|$)/);

  return {
    answer: answerMatch?.[1]?.trim() || trimmed,
    nextStep: nextStepMatch?.[1]?.trim() || fallback.nextStep,
    suggestDoctor: parseBoolean(suggestDoctorMatch?.[1] ?? ""),
    riskLevel: parseRiskLevel((riskLevelMatch?.[1] ?? "").toLowerCase()),
    category: fallback.category,
    source: fallback.source,
    knowledgeIds: fallback.knowledgeIds,
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
    message.includes("kimi_timeout") ||
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

function buildGeneralPrompt(question: string) {
  return `用户问题：${question}

这个问题属于家医 Claw 的服务范围，但没有命中 FAQ 或知识库。请只提供一般性的服务导航回答，不要扩展到诊断、处方、停药、换药、剂量调整或个体化治疗建议。请严格按下面格式输出：
回答：...
下一步建议：...
是否建议联系家庭医生：是/否
风险等级：low|medium|high|emergency`;
}

async function requestKimi(
  prompt: string,
  systemPrompt: string,
  client: OpenAI,
  model: string,
) {
  const completion = (await Promise.race([
    client.chat.completions.create({
      model,
      temperature: 1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
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

  return text;
}

async function runKimiWithCache(
  cacheKey: string,
  prompt: string,
  systemPrompt: string,
  fallbackMeta: {
    category: string;
    nextStep: string;
    source: AskReply["source"];
    knowledgeIds?: string[];
  },
) {
  const apiKey = readEnvValue("KIMI_API_KEY").replace(/^Bearer\s+/i, "");

  if (!apiKey) {
    return {
      reply: getFallbackAskReply("no_env_key"),
      errorReason: "no_env_key" as AskFallbackReason,
    };
  }

  const cachedReply = getCachedKimiReply(cacheKey);
  if (cachedReply) {
    return { reply: cachedReply, errorReason: null };
  }

  const client = new OpenAI({
    apiKey,
    baseURL: readEnvValue("KIMI_BASE_URL") || "https://api.moonshot.cn/v1",
  });
  const model = readEnvValue("KIMI_MODEL") || "kimi-k2.6";

  const pending =
    kimiInFlight.get(cacheKey) ??
    (async () => {
      const text = await requestKimi(prompt, systemPrompt, client, model);
      const reply = parseStructuredReply(text, fallbackMeta);
      setCachedKimiReply(cacheKey, reply);
      return reply;
    })();

  kimiInFlight.set(cacheKey, pending);

  try {
    return {
      reply: await pending,
      errorReason: null,
    };
  } catch (error) {
    let reason: AskFallbackReason = "kimi_error";

    if (isAuthError(error)) {
      reason = "auth_error";
    } else if (isRateLimitError(error)) {
      reason = "rate_limit";
    } else if (isTimeoutError(error)) {
      reason = "timeout";
    } else if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      String(error.message).includes("KIMI_EMPTY_REPLY")
    ) {
      reason = "model_error";
    }

    return {
      reply: getFallbackAskReply(reason),
      errorReason: reason,
    };
  } finally {
    kimiInFlight.delete(cacheKey);
  }
}

function buildKnowledgeCacheKey(question: string, items: KnowledgeItem[]) {
  return `knowledge::${normalizeQuestion(question)}::${items.map((item) => item.id).join(",")}`;
}

function buildGeneralCacheKey(question: string) {
  return `general::${normalizeQuestion(question)}`;
}

async function findAssignableUserId(
  role: Exclude<AppRole, "resident" | "family" | "admin"> | "doctor",
  supabase: NonNullable<Awaited<ReturnType<typeof getServerAuthContext>>["supabase"]>,
) {
  const { data } = (await supabase
    .from("profiles")
    .select("id")
    .eq("role", role)
    .limit(1)
    .maybeSingle()) as { data: { id: string } | null };

  return data?.id ?? null;
}

async function persistAskArtifacts(params: {
  question: string;
  reply: AskReply;
  profile: ProfileRow | null;
  supabase: Awaited<ReturnType<typeof getServerAuthContext>>["supabase"];
}) {
  const { question, reply, profile, supabase } = params;
  let askLogToLocal = true;
  let doctorTodoToLocal =
    reply.suggestDoctor || reply.riskLevel === "high" || reply.riskLevel === "emergency";
  let serviceTodo: DemoDoctorTodo | null = null;
  const summary = generateClawSummary(question, {
    answer: reply.answer,
    nextStep: reply.nextStep,
    riskLevel: reply.riskLevel,
    suggestDoctor: reply.suggestDoctor,
  });

  if (!supabase || !profile) {
    return {
      askLogToLocal,
      doctorTodoToLocal,
      residentName: profile?.display_name ?? "当前居民",
      serviceTodo,
    };
  }

  const assigneeRole =
    summary.recommendedRole.role === "family"
      ? "doctor"
      : (summary.recommendedRole
          .role as Exclude<AppRole, "resident" | "family" | "admin"> | "doctor");
  const assignedTo = doctorTodoToLocal
    ? await findAssignableUserId(assigneeRole, supabase)
    : null;

  try {
    await createAskLog({
      userId: profile.id,
      question,
      answer: `${reply.answer} ${reply.nextStep}`.trim(),
      source: reply.source,
      category: reply.category,
      riskLevel: reply.riskLevel,
      suggestDoctor: reply.suggestDoctor,
      reason: reply.reason ?? null,
      supabase,
    });
    askLogToLocal = false;
  } catch {
    askLogToLocal = true;
  }

  if (!doctorTodoToLocal) {
    return {
      askLogToLocal,
      doctorTodoToLocal: false,
      residentName: profile.display_name,
      serviceTodo,
    };
  }

  try {
    const result = await createDoctorTodo({
      residentId: profile.role === "resident" ? profile.id : null,
      assignedTo,
      type: "ask",
      title: question.slice(0, 36),
      description: summary.doctorSummary,
      originalQuestion: question,
      clawAnswer: `${reply.answer} ${reply.nextStep}`.trim(),
      riskLevel: reply.riskLevel,
      source: "ask",
      supabase,
    });

    doctorTodoToLocal = !result.ok;

    if (result.ok && result.todo) {
      serviceTodo = {
        id: result.todo.id,
        residentId: result.todo.resident_id ?? profile.id,
        residentName: profile.display_name,
        question,
        riskLevel: reply.riskLevel,
        status: result.todo.status,
        createdAt: result.todo.created_at,
        source: reply.source,
        recommendedRole: summary.recommendedRole.role,
        recommendedRoleLabel: summary.recommendedRole.displayLabel,
        recommendedReason: summary.recommendedRole.reason,
        originalQuestion: question,
        clawAnswer: summary.clawResponse,
        summary: summary.doctorSummary,
        preparedMaterials: summary.prepareItems,
      };

      await createTodoStatusEvent({
        todoId: result.todo.id,
        actorId: profile.id,
        oldStatus: null,
        newStatus: "pending",
        note: "Claw 已为您生成家医团队提醒。",
        supabase,
      });

      if (profile.role === "resident") {
        try {
          await createNotification(
            {
              userId: profile.id,
              actorId: profile.id,
              type: "ask_todo_created",
              title: "已为您生成家医团队提醒",
              content: "您的问题已整理为待处理提醒，家医团队可在工作台查看。",
              linkUrl: "/service-progress",
              metadata: {
                todoId: result.todo.id,
                residentId: profile.id,
              },
            },
            supabase,
          );
        } catch {
          // best effort
        }
      }

      if (assignedTo) {
        try {
          await createNotification(
            {
              userId: assignedTo,
              actorId: profile.id,
              type: "ask_todo_created",
              title: "收到新的待处理问题",
              content: "有一条居民问题需要您查看。",
              linkUrl: "/doctor",
              metadata: {
                todoId: result.todo.id,
                residentId: result.todo.resident_id,
                recommendedRole: summary.recommendedRole.role,
              },
            },
            supabase,
          );
        } catch {
          // best effort
        }
      }

      if (
        profile.role === "resident" &&
        (reply.riskLevel === "high" || reply.riskLevel === "emergency")
      ) {
        const bindings = await getActiveFamilyBindingsForResident(profile.id, supabase);

        for (const binding of bindings.filter((item) => item.isPrimary)) {
          try {
            await createNotification(
              {
                userId: binding.familyId,
                actorId: profile.id,
                type: "ask_todo_created",
                title: "绑定老人有一条家医团队提醒",
                content: "老人有一条问题已转给家医团队，您可以在家属端查看服务进度。",
                linkUrl: "/family",
                metadata: {
                  todoId: result.todo.id,
                  residentId: profile.id,
                  residentName: profile.display_name,
                },
              },
              supabase,
            );
          } catch {
            // best effort
          }
        }
      }
    }
  } catch {
    doctorTodoToLocal = true;
  }

  return {
    askLogToLocal,
    doctorTodoToLocal,
    residentName: profile.display_name,
    serviceTodo,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { question?: string };
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const normalizedQuestion = normalizeQuestion(question);

    if (!normalizedQuestion) {
      return NextResponse.json({
        ...getFallbackAskReply("unknown"),
        clientFallbacks: {
          askLogToLocal: true,
          doctorTodoToLocal: false,
        },
      });
    }

    const authContext = await getServerAuthContext();
    const { supabase, profile } = authContext;

    const finalize = async (reply: AskReply) => {
      const persistence = await persistAskArtifacts({
        question,
        reply,
        profile,
        supabase,
      });

      return NextResponse.json({
        ...reply,
        clientFallbacks: persistence,
        serviceTodo: persistence.serviceTodo ?? null,
      });
    };

    const guardrailReply = getGuardrailReply(question);
    if (guardrailReply) {
      return finalize(guardrailReply);
    }

    const greetingReply = getGreetingReply(question);
    if (greetingReply) {
      return finalize(greetingReply);
    }

    const faqItems = await getFaqs(supabase);
    const faqReply = getLocalAskReply(question, faqItems);
    if (faqReply?.source === "faq") {
      return finalize(faqReply);
    }

    const knowledgeHits = searchKnowledge(question);
    if (knowledgeHits.length > 0) {
      const knowledgeIds = knowledgeHits.map((item) => item.id);
      const fallbackMeta = {
        category: knowledgeHits[0].category,
        nextStep: "如果您还是拿不准，建议联系家庭医生或社区卫生服务中心进一步确认。",
        source: "knowledge_kimi" as const,
        knowledgeIds,
      };

      const { reply, errorReason } = await runKimiWithCache(
        buildKnowledgeCacheKey(question, knowledgeHits),
        buildKnowledgePrompt(question, knowledgeHits),
        knowledgeSystemPrompt,
        fallbackMeta,
      );

      if (reply.source === "fallback") {
        return finalize({
          ...reply,
          reason: errorReason ?? reply.reason ?? "kimi_error",
        });
      }

      return finalize({
        ...reply,
        source: "knowledge_kimi",
        category: knowledgeHits[0].category,
        knowledgeIds,
      });
    }

    if (!isInScope(question)) {
      return finalize(getFallbackAskReply("out_of_scope"));
    }

    const { reply, errorReason } = await runKimiWithCache(
      buildGeneralCacheKey(question),
      buildGeneralPrompt(question),
      generalSystemPrompt,
      {
        category: "服务导航",
        nextStep: "如果问题仍然不清楚，建议联系家庭医生或社区卫生服务中心确认。",
        source: "kimi",
      },
    );

    if (reply.source === "fallback") {
      return finalize({
        ...reply,
        reason: errorReason ?? reply.reason ?? "kimi_error",
      });
    }

    return finalize({
      ...reply,
      source: "kimi",
      category: reply.category || "服务导航",
    });
  } catch {
    return NextResponse.json({
      ...getFallbackAskReply("unknown"),
      clientFallbacks: {
        askLogToLocal: true,
        doctorTodoToLocal: false,
      },
    });
  }
}

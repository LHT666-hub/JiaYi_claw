import OpenAI from "openai";
import { NextRequest, NextResponse, after } from "next/server";
import { getAiModelConfig, getTextModelCandidates } from "@/lib/ai/config";
import { buildAgentReply, inferServiceRequestFromQuestion } from "@/lib/agent";
import {
  getCurrentServiceOwnerRole,
  normalizeAssignableRole,
  buildPersistedServiceTask,
  buildServiceTaskTitle,
  encodeDescriptionWithServiceTask,
} from "@/lib/agentTaskPayload";
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
import { buildKnowledgePrompt, searchKnowledge } from "@/lib/knowledge";
import {
  buildVerifiedPublicInfoReply,
  searchPublicInfo,
} from "@/lib/publicInfoRepository";
import {
  getApiAuthContext,
  getServerAuthContext,
} from "@/lib/supabase/server-auth";
import type {
  AppRole,
  AskFallbackReason,
  AskReply,
  DemoDoctorTodo,
  KnowledgeItem,
  ProfileRow,
  ServiceRequestPayload,
} from "@/lib/types";
import {
  formatMemoryContextForPrompt,
  createMemoryExtractor,
  saveCandidate,
} from "@/lib/memory";
import type { BuiltMemoryContext } from "@/lib/memory";

export const runtime = "nodejs";

const knowledgeSystemPrompt =
  "你是“家医 Claw”，用于家庭医生服务导航与慢病科普信息。你不能提供诊断、处方、停药、换药、剂量调整、严重程度判断或个体化治疗建议。请优先依据给定知识片段回答，并在最后给出下一步建议。";

const generalSystemPrompt =
  "你是“家医 Claw”，负责把居民问题整理成可执行的家庭医生服务路径。你可以解释通用健康概念和本产品的办理步骤，但不得编造本地医生、排班、号源、药品库存、政策、机构电话或服务承诺；缺少已核验来源时要明确说无法核验，并建议查看服务页或由家医团队确认。你不能提供诊断、处方、停药、换药、剂量调整或个体化治疗建议。如果提供了居民记忆数据，你可以在回答中适当引用（如“你之前提到过……”），但不要主动提及记忆系统本身。";

const unauthenticatedUnverifiedReply: AskReply = {
  answer:
    "目前没有找到可公开核验的对应资料，我不能把模型推测当作本地事实告诉您。",
  nextStep:
    "请在公开信息页查看已审核来源；登录后也可以让 Claw 为您整理个人服务诉求。",
  suggestDoctor: false,
  riskLevel: "low",
  category: "未核验信息",
  source: "fallback",
  reason: "auth_error",
};

const KIMI_CACHE_TTL_MS = 5 * 60 * 1000;
const KIMI_TIMEOUT_MS = 40_000;
const kimiCache = new Map<string, { expiresAt: number; reply: AskReply }>();
const kimiInFlight = new Map<string, Promise<AskReply>>();

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
  const answerMatch = trimmed.match(
    /回答[:：]\s*([\s\S]*?)(?:\n\s*下一步建议[:：]|$)/,
  );
  const nextStepMatch = trimmed.match(
    /下一步建议[:：]\s*([\s\S]*?)(?:\n\s*是否建议联系家庭医生[:：]|$)/,
  );
  const suggestDoctorMatch = trimmed.match(
    /是否建议联系家庭医生[:：]\s*(.+?)(?:\n|$)/,
  );
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
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : null;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : null;
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
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : null;
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? error.name
      : null;
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
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : null;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : null;
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

function isModelError(error: unknown) {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : null;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message).toLowerCase()
      : "";

  return (
    status === 400 ||
    message.includes("model") ||
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("invalid model")
  );
}

function buildGeneralPrompt(question: string, memoryText?: string) {
  const memoryBlock = memoryText ? `\n\n${memoryText}` : "";
  return `用户问题：${question}${memoryBlock}

这个问题可能是家医服务问题，也可能是一般问题。请优先给出清晰、可执行的回答；如果涉及医疗诊断、处方、停药、换药、剂量调整或个体化治疗建议，必须明确提示用户联系医生。请严格按下面格式输出：
回答：...
下一步建议：...
是否建议联系家庭医生：是/否
风险等级：low|medium|high|emergency`;
}

function buildFaqPrompt(question: string, faqReply: AskReply, memoryText?: string) {
  const memoryBlock = memoryText ? `\n\n${memoryText}` : "";
  return `用户问题：${question}

FAQ参考回答：
${faqReply.answer}

FAQ建议下一步：
${faqReply.nextStep}${memoryBlock}

请你作为最终答复把关，把上面的FAQ内容组织成更自然、更易懂的一段回答。允许补充必要说明，但不要给出诊断、处方、停药、换药、剂量调整或个体化治疗建议。请严格按下面格式输出：
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

async function requestKimiWithModelFallback(
  prompt: string,
  systemPrompt: string,
  client: OpenAI,
  modelCandidates: string[],
) {
  const tried = new Set<string>();
  let lastError: unknown = null;

  for (const model of modelCandidates) {
    const normalized = model.trim();
    if (!normalized || tried.has(normalized)) {
      continue;
    }
    tried.add(normalized);

    try {
      return await requestKimi(prompt, systemPrompt, client, normalized);
    } catch (error) {
      lastError = error;
      if (!isModelError(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("KIMI_MODEL_NOT_AVAILABLE");
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
  const config = getAiModelConfig("text");
  const apiKey = config.apiKey.replace(/^Bearer\s+/i, "");
  const baseURL = config.baseURL;
  const modelCandidates = getTextModelCandidates();

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
    baseURL,
  });

  const pending =
    kimiInFlight.get(cacheKey) ??
    (async () => {
      const text = await requestKimiWithModelFallback(
        prompt,
        systemPrompt,
        client,
        modelCandidates,
      );
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

function getKimiRuntimeInfo() {
  const config = getAiModelConfig("text");
  const hasApiKey = Boolean(config.apiKey);
  const baseURL = config.baseURL;
  const modelCandidates = getTextModelCandidates();

  return {
    hasApiKey,
    baseURL,
    modelCandidates,
  };
}

function buildKnowledgeCacheKey(question: string, items: KnowledgeItem[]) {
  return `knowledge::${normalizeQuestion(question)}::${items.map((item) => item.id).join(",")}`;
}

function buildGeneralCacheKey(question: string) {
  return `general::${normalizeQuestion(question)}`;
}

function buildFaqCacheKey(question: string, faqReply: AskReply) {
  const faqSignature = `${normalizeQuestion(faqReply.answer)}::${normalizeQuestion(
    faqReply.nextStep,
  )}`;
  return `faq::${normalizeQuestion(question)}::${faqSignature.slice(0, 180)}`;
}

async function findAssignableUserId(
  role: Exclude<AppRole, "resident" | "family" | "admin"> | "doctor",
  supabase: NonNullable<
    Awaited<ReturnType<typeof getServerAuthContext>>["supabase"]
  >,
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
  serviceRequest?: ServiceRequestPayload | null;
  profile: ProfileRow | null;
  supabase: Awaited<ReturnType<typeof getServerAuthContext>>["supabase"];
  allowWrite: boolean;
}) {
  const { question, reply, serviceRequest, profile, supabase, allowWrite } =
    params;
  const retainTranscript =
    process.env.ASSISTANT_TRANSCRIPT_RETENTION === "true";
  // Legacy clients understand this flag as permission to persist locally.
  // Formal environments never fall back to device storage for health chat.
  const askLogToLocal = false;
  let doctorTodoToLocal =
    allowWrite &&
    (reply.suggestDoctor ||
      reply.riskLevel === "high" ||
      reply.riskLevel === "emergency");
  let serviceTodo: DemoDoctorTodo | null = null;
  const serviceTask = buildPersistedServiceTask(
    reply.agentResult,
    serviceRequest,
  );
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

  const currentServiceOwnerRole = normalizeAssignableRole(
    getCurrentServiceOwnerRole(serviceTask),
  );
  const assigneeRole =
    currentServiceOwnerRole ??
    (summary.recommendedRole.role === "family"
      ? "doctor"
      : (summary.recommendedRole.role as
          Exclude<AppRole, "resident" | "family" | "admin"> | "doctor"));
  const assignedTo = doctorTodoToLocal
    ? await findAssignableUserId(assigneeRole, supabase)
    : null;

  if (retainTranscript) {
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
    } catch {
      // No local fallback: failed transcript logging must not copy health chat
      // onto the resident's device.
    }
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
      type: serviceTask ? `service_${serviceTask.task.intent}` : "ask",
      title: serviceTask
        ? buildServiceTaskTitle(serviceTask.task)
        : question.slice(0, 36),
      description: encodeDescriptionWithServiceTask(
        summary.doctorSummary,
        serviceTask,
      ),
      originalQuestion: question,
      clawAnswer: `${reply.answer} ${reply.nextStep}`.trim(),
      riskLevel: reply.riskLevel,
      source: reply.source === "agent" ? "agent" : "ask",
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
        serviceTask,
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
        const bindings = await getActiveFamilyBindingsForResident(
          profile.id,
          supabase,
        );

        for (const binding of bindings.filter((item) => item.isPrimary)) {
          try {
            await createNotification(
              {
                userId: binding.familyId,
                actorId: profile.id,
                type: "ask_todo_created",
                title: "绑定老人有一条家医团队提醒",
                content:
                  "老人有一条问题已转给家医团队，您可以在家属端查看服务进度。",
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
    const body = (await request.json()) as {
      question?: string;
      serviceRequest?: ServiceRequestPayload | null;
      residentMemory?: BuiltMemoryContext | null;
    };
    const question =
      typeof body.question === "string" ? body.question.trim() : "";
    const serviceRequest =
      body.serviceRequest ?? inferServiceRequestFromQuestion(question);
    const normalizedQuestion = normalizeQuestion(question);

    // Build formatted memory text for prompt injection (DATA block, not instruction)
    const formattedMemoryText = body.residentMemory
      ? formatMemoryContextForPrompt(body.residentMemory)
      : "";

    if (!normalizedQuestion) {
      return NextResponse.json({
        ...getFallbackAskReply("unknown"),
        clientFallbacks: {
          askLogToLocal: false,
          doctorTodoToLocal: false,
        },
      });
    }

    const authContext = await getApiAuthContext(request);
    const { supabase, profile } = authContext;

    const finalize = async (reply: AskReply) => {
      const persistence = await persistAskArtifacts({
        question,
        reply,
        serviceRequest,
        profile,
        supabase,
        // The legacy endpoint is read-only. Formal writes must use the
        // permission-checked /api/v1/service-requests confirmation flow.
        allowWrite: false,
      });

      const responseJson = {
        ...reply,
        clientFallbacks: persistence,
        serviceTodo: persistence.serviceTodo ?? null,
      };

      // Async memory candidate extraction — uses Next.js after() for reliable
      // background execution in serverless environments.
      if (profile && supabase && question) {
        const residentId = profile.role === "resident" ? profile.id : (body.residentMemory?.identity?.residentId ?? null);
        if (residentId && profile.organization_id) {
          const extractor = createMemoryExtractor();
          const capturedQuestion = question;
          const capturedResidentId = residentId;
          const capturedOrganizationId = profile.organization_id;
          const capturedRecentMemories = body.residentMemory?.relevantMemories ?? [];
          after(async () => {
            try {
              const candidate = await extractor.extract(capturedQuestion, {
                residentId: capturedResidentId,
                recentMemories: capturedRecentMemories,
              });
              if (candidate && candidate.should_store) {
                await saveCandidate({
                  supabase,
                  residentId: capturedResidentId,
                  organizationId: capturedOrganizationId,
                  candidate,
                });
              }
            } catch {
              // Graceful: extraction failure never affects response
            }
          });
        }
      }

      return NextResponse.json(responseJson);
    };

    const guardrailReply = getGuardrailReply(question);
    if (guardrailReply) {
      return finalize(guardrailReply);
    }

    const greetingReply = getGreetingReply(question);
    if (greetingReply) {
      return finalize(greetingReply);
    }

    const publicInfoMatches = await searchPublicInfo(question);
    if (publicInfoMatches.length) {
      return finalize(buildVerifiedPublicInfoReply(publicInfoMatches[0]));
    }

    const agentReply = buildAgentReply(question, serviceRequest);
    if (agentReply) {
      return finalize(agentReply);
    }

    const faqItems = await getFaqs(supabase);
    const faqReply = getLocalAskReply(question, faqItems);
    if (faqReply?.source === "faq") {
      const { reply, errorReason } = await runKimiWithCache(
        buildFaqCacheKey(question, faqReply),
        buildFaqPrompt(question, faqReply, formattedMemoryText || undefined),
        generalSystemPrompt,
        {
          category: faqReply.category,
          nextStep: faqReply.nextStep,
          source: "faq_model",
        },
      );

      if (reply.source === "fallback") {
        return finalize({
          ...faqReply,
          reason: errorReason ?? reply.reason ?? "kimi_error",
        });
      }

      return finalize({
        ...reply,
        source: "faq_model",
        category: faqReply.category || reply.category || "服务导航",
      });
    }

    if (!profile && process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
      return finalize(unauthenticatedUnverifiedReply);
    }

    const knowledgeHits = searchKnowledge(question);
    if (knowledgeHits.length > 0) {
      const knowledgeIds = knowledgeHits.map((item) => item.id);
      const fallbackMeta = {
        category: knowledgeHits[0].category,
        nextStep:
          "如果您还是拿不准，建议联系家庭医生或社区卫生服务中心进一步确认。",
        source: "knowledge_model" as const,
        knowledgeIds,
      };

      const { reply, errorReason } = await runKimiWithCache(
        buildKnowledgeCacheKey(question, knowledgeHits),
        buildKnowledgePrompt(question, knowledgeHits) + (formattedMemoryText ? `\n\n${formattedMemoryText}` : ""),
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
        source: "knowledge_model",
        category: knowledgeHits[0].category,
        knowledgeIds,
      });
    }

    const { reply, errorReason } = await runKimiWithCache(
      buildGeneralCacheKey(question),
      buildGeneralPrompt(question, formattedMemoryText || undefined),
      generalSystemPrompt,
      {
        category: "服务导航",
        nextStep:
          "如果问题仍然不清楚，建议联系家庭医生或社区卫生服务中心确认。",
        source: "model",
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
      source: "model",
      category: reply.category || "服务导航",
    });
  } catch {
    return NextResponse.json({
      ...getFallbackAskReply("unknown"),
      clientFallbacks: {
        askLogToLocal: false,
        doctorTodoToLocal: false,
      },
    });
  }
}

export async function GET(request: NextRequest) {
  const kimi = getKimiRuntimeInfo();
  const question = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (question) {
    const guardrailReply = getGuardrailReply(question);
    if (guardrailReply) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        question,
        reply: guardrailReply,
      });
    }

    const greetingReply = getGreetingReply(question);
    if (greetingReply) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        question,
        reply: greetingReply,
      });
    }

    const publicInfoMatches = await searchPublicInfo(question);
    if (publicInfoMatches.length) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        question,
        reply: buildVerifiedPublicInfoReply(publicInfoMatches[0]),
      });
    }

    const agentReply = buildAgentReply(
      question,
      inferServiceRequestFromQuestion(question),
    );
    if (agentReply) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        question,
        reply: agentReply,
      });
    }

    const authContext = await getApiAuthContext(request);
    const faqItems = await getFaqs(authContext.supabase);
    const faqReply = getLocalAskReply(question, faqItems);
    if (faqReply?.source === "faq") {
      const { reply, errorReason } = await runKimiWithCache(
        buildFaqCacheKey(question, faqReply),
        buildFaqPrompt(question, faqReply),
        generalSystemPrompt,
        {
          category: faqReply.category,
          nextStep: faqReply.nextStep,
          source: "faq_model",
        },
      );
      return NextResponse.json({
        ok: true,
        dryRun: true,
        question,
        reply:
          reply.source === "fallback"
            ? {
                ...faqReply,
                reason: errorReason ?? reply.reason ?? "kimi_error",
              }
            : {
                ...reply,
                source: "faq_model",
                category: faqReply.category || reply.category || "服务导航",
              },
      });
    }

    if (!authContext.profile) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        question,
        reply: unauthenticatedUnverifiedReply,
      });
    }

    const knowledgeHits = searchKnowledge(question);
    if (knowledgeHits.length > 0) {
      const fallbackMeta = {
        category: knowledgeHits[0].category,
        nextStep:
          "如果您还是拿不准，建议联系家庭医生或社区卫生服务中心进一步确认。",
        source: "knowledge_model" as const,
        knowledgeIds: knowledgeHits.map((item) => item.id),
      };
      const { reply, errorReason } = await runKimiWithCache(
        buildKnowledgeCacheKey(question, knowledgeHits),
        buildKnowledgePrompt(question, knowledgeHits),
        knowledgeSystemPrompt,
        fallbackMeta,
      );
      return NextResponse.json({
        ok: true,
        dryRun: true,
        question,
        reply:
          reply.source === "fallback"
            ? { ...reply, reason: errorReason ?? reply.reason ?? "kimi_error" }
            : {
                ...reply,
                source: "knowledge_model",
                category: knowledgeHits[0].category,
                knowledgeIds: fallbackMeta.knowledgeIds,
              },
      });
    }

    const { reply, errorReason } = await runKimiWithCache(
      buildGeneralCacheKey(question),
      buildGeneralPrompt(question),
      generalSystemPrompt,
      {
        category: "服务导航",
        nextStep:
          "如果问题仍然不清楚，建议联系家庭医生或社区卫生服务中心确认。",
        source: "model",
      },
    );
    return NextResponse.json({
      ok: true,
      dryRun: true,
      question,
      reply:
        reply.source === "fallback"
          ? { ...reply, reason: errorReason ?? reply.reason ?? "kimi_error" }
          : {
              ...reply,
              source: "model",
              category: reply.category || "服务导航",
            },
    });
  }

  return NextResponse.json({
    ok: true,
    endpoint: "/api/ask",
    method: "POST",
    status: kimi.hasApiKey ? "kimi_enabled" : "fallback_only",
    kimi: {
      enabled: kimi.hasApiKey,
      baseURL: kimi.baseURL,
      modelCandidates: kimi.modelCandidates,
    },
    flow: [
      "guardrail",
      "greeting",
      "public_info",
      "agent",
      "faq_kimi",
      "knowledge_kimi",
      "kimi",
      "fallback",
    ],
  });
}

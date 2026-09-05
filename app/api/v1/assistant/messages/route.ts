import { NextRequest, after } from "next/server";
import { z } from "zod";
import { POST as legacyAskPost } from "@/app/api/ask/route";
import { getAiModelConfig } from "@/lib/ai/config";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { buildAssistantActions } from "@/lib/assistant/actions";
import { markTrustedAskRequest } from "@/lib/assistant/internalAskRequest";
import {
  buildAssistantActivity,
  presentAssistantActivity,
} from "@/lib/assistant/activity";
import { resolveCareSubject } from "@/lib/careSubjects";
import { getResidentCareAccess } from "@/lib/db/carePlatform";
import { buildAgentReply, inferServiceRequestFromQuestion } from "@/lib/agent";
import { getGreetingReply, getGuardrailReply } from "@/lib/faq";
import { CURRENT_POLICY_VERSION } from "@/lib/policies";
import { buildGroundedKnowledgeReply } from "@/lib/rag/answer";
import { searchKnowledge } from "@/lib/rag/search";
import {
  buildVerifiedPublicInfoReply,
  searchPublicInfo,
} from "@/lib/publicInfoRepository";
import { getSkillDefinition, routeSkillIds } from "@/lib/skills/registry";
import {
  buildCurrentInfoNotFoundReply,
  requiresVerifiedCurrentInfo,
} from "@/lib/assistant/verifiedCurrentInfo";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import {
  buildMemoryContext,
  createMemoryExtractor,
  saveCandidate,
} from "@/lib/memory";

const inputSchema = z.object({
  question: z.string().trim().min(1).max(3000),
  residentId: z.string().uuid().optional(),
  serviceRequest: z.unknown().nullable().optional(),
  sourceContext: z.object({ type: z.literal("content"), id: z.string().uuid() }).optional(),
});

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_MESSAGE", "请输入要咨询的问题。", 400, traceId);

  let skillIds = routeSkillIds(parsed.data.question);
  const immediateReply = getGuardrailReply(parsed.data.question)
    ?? getGreetingReply(parsed.data.question);
  if (immediateReply) {
    const draft = inferServiceRequestFromQuestion(parsed.data.question);
    return apiOk({
      reply: immediateReply,
      skillIds: immediateReply.source === "safety" ? ["safety-triage"] : skillIds,
      actions: buildAssistantActions({ question: parsed.data.question, reply: immediateReply, serviceRequest: draft }),
      draft,
      careSubject: null,
      writePerformed: false,
      activity: null,
      rawTranscriptStored: false,
    }, traceId);
  }
  const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile) {
    const inferredDraft = inferServiceRequestFromQuestion(parsed.data.question);
    const agentReply = buildAgentReply(parsed.data.question, inferredDraft);
    const publicMatches = agentReply
      ? []
      : await searchPublicInfo(parsed.data.question);
    const publicReply = publicMatches[0]
      ? buildVerifiedPublicInfoReply(publicMatches[0])
      : null;
    const requiresCurrentSource = requiresVerifiedCurrentInfo(parsed.data.question);
    let reply =
      publicReply ??
      agentReply ??
      (requiresCurrentSource ? buildCurrentInfoNotFoundReply() : null);
    if (!reply && process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      const demoRequest = markTrustedAskRequest(
        new NextRequest(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify({
            question: parsed.data.question,
            serviceRequest: null,
            confirmedWrite: false,
          }),
        }),
        null,
      );
      const demoResponse = await legacyAskPost(demoRequest);
      if (demoResponse.ok) reply = await demoResponse.json();
    }
    if (!reply) {
      return apiError(
        "AUTH_REQUIRED_FOR_ASSISTANT",
        "登录后才能使用 Claw 整理个人服务；公开排班和活动可在公开信息中查询。",
        401,
        traceId,
      );
    }
    return apiOk(
      {
        reply,
        skillIds: publicReply || requiresCurrentSource
            ? ["public-info-qa"]
            : routeSkillIds(parsed.data.question),
        actions: buildAssistantActions({
          question: parsed.data.question,
          reply,
          serviceRequest: inferredDraft,
        }),
        draft: inferredDraft,
        careSubject: null,
        writePerformed: false,
      },
      traceId,
    );
  }
  const careSubject = await resolveCareSubject(
    request,
    auth.profile,
    auth.supabase,
    parsed.data.residentId ?? null,
  ).catch(() => null);
  if (!careSubject) {
    return apiError(
      "CARE_SUBJECT_REQUIRED",
      auth.profile.role === "family"
        ? "请先完成居民本人授权并选择服务对象。"
        : "当前账号不能使用居民 Claw 助手。",
      auth.profile.role === "family" ? 409 : 403,
      traceId,
    );
  }
  const [careState, consentResult] = await Promise.all([
    getResidentCareAccess(careSubject.residentId, auth.supabase),
    auth.supabase
      .from("consents")
      .select("granted")
      .eq("user_id", auth.profile.id)
      .eq("resident_id", careSubject.residentId)
      .eq("scope", "ai_processing")
      .eq("policy_version", CURRENT_POLICY_VERSION)
      .maybeSingle(),
  ]);
  if (!careState.access.canSubmitService) {
    const inferredDraft = inferServiceRequestFromQuestion(parsed.data.question);
    const safetyReply = getGuardrailReply(parsed.data.question);
    const publicMatches = safetyReply ? [] : await searchPublicInfo(parsed.data.question);
    const publicReply = publicMatches[0] ? buildVerifiedPublicInfoReply(publicMatches[0]) : null;
    const reply =
      safetyReply ??
      publicReply ??
      (requiresVerifiedCurrentInfo(parsed.data.question)
        ? buildCurrentInfoNotFoundReply()
        : null);
    if (!reply) {
      return apiError(
        "CARE_BINDING_VERIFICATION_REQUIRED",
        `${careState.access.message} 当前仍可查询已审核的排班、活动和办事信息。`,
        403,
        traceId,
      );
    }
    return apiOk({
      reply,
      skillIds: safetyReply ? ["safety-triage"] : ["public-info-qa"],
      actions: buildAssistantActions({ question: parsed.data.question, reply, serviceRequest: inferredDraft }),
      draft: inferredDraft,
      careSubject: careSubject.selected,
      writePerformed: false,
      activity: null,
      rawTranscriptStored: false,
      access: careState.access,
    }, traceId);
  }
  {
    const { data: aiConsent, error: consentError } = consentResult;
    if (consentError) {
      return apiError(
        "AI_CONSENT_CHECK_FAILED",
        "暂时无法核验 AI 授权，请稍后重试。",
        503,
        traceId,
      );
    }
    if (!aiConsent?.granted) {
      return apiError(
        "AI_CONSENT_REQUIRED",
        "请先在“我的 - 隐私与授权”中开启当前服务对象的 AI 辅助整理。",
        403,
        traceId,
      );
    }
  }

  let contentContext: {
    id: string;
    title: string;
    summary: string;
    source_name: string;
    original_url: string;
    reviewed_at: string | null;
    category: "notice" | "activity" | "health_classroom" | "schedule_notice" | "policy";
  } | null = null;
  if (parsed.data.sourceContext) {
    const now = new Date().toISOString();
    let contextQuery = auth.supabase.from("content_items")
      .select("id,title,summary,source_name,original_url,reviewed_at,category")
      .eq("id", parsed.data.sourceContext.id)
      .eq("organization_id", auth.profile.organization_id)
      .eq("status", "published")
      .or(`effective_from.is.null,effective_from.lte.${now}`)
      .or(`expires_at.is.null,expires_at.gt.${now}`);
    const communityId = careState.binding?.community_id ?? auth.profile.community_id;
    if (communityId) contextQuery = contextQuery.or(`community_id.eq.${communityId},community_id.is.null`);
    const { data, error } = await contextQuery.maybeSingle();
    if (error) return apiError("ASSISTANT_SOURCE_CHECK_FAILED", "暂时无法核验内容来源。", 503, traceId);
    if (!data) return apiError("ASSISTANT_SOURCE_NOT_AVAILABLE", "这条内容已下架、过期或不属于当前服务社区。", 404, traceId);
    contentContext = data;
    skillIds = [...new Set([...skillIds, "public-info-qa"] )];
  }
  let inferredServiceRequest = inferServiceRequestFromQuestion(
    parsed.data.question,
  );
  if (
    contentContext?.category === "activity"
    && /(?:帮我|给我|我要|我想|申请).{0,10}(?:报名|参加)|(?:报名|参加).{0,6}(?:这个|该)?活动/.test(parsed.data.question)
  ) {
    inferredServiceRequest = {
      kind: "community_activity",
      activityTitle: contentContext.title,
      contentId: contentContext.id,
      sourceName: contentContext.source_name,
    };
    skillIds = [...new Set([...skillIds, "service-intent-extractor", "appointment-intake"])];
  }
  let reply;
  const contextGuardrail = contentContext ? getGuardrailReply(parsed.data.question) : null;
  const generalGuardrail = getGuardrailReply(parsed.data.question);
  const communityId = careState.binding?.community_id ?? auth.profile.community_id;
  const requiresCurrentSource = requiresVerifiedCurrentInfo(parsed.data.question);
  const shouldSearchPublicInfo = !contentContext && !generalGuardrail
    && (requiresCurrentSource || skillIds.includes("public-info-qa"));
  const publicMatches = shouldSearchPublicInfo
    ? await searchPublicInfo(parsed.data.question).catch(() => [])
    : [];
  const publicReply = publicMatches[0]
    ? buildVerifiedPublicInfoReply(publicMatches[0])
    : null;
  const agentReply = !contentContext && !generalGuardrail && !publicReply
    ? buildAgentReply(parsed.data.question, inferredServiceRequest)
    : null;
  let ragReply = null;
  if (!contentContext && !generalGuardrail && !publicReply && !agentReply && auth.profile.organization_id) {
    const ragHits = await searchKnowledge({
      supabase: auth.supabase,
      query: parsed.data.question,
      organizationId: auth.profile.organization_id,
      communityId,
      visibility: ["public", "resident"],
      limit: 8,
    }).catch(() => []);
    ragReply = ragHits.length
      ? await buildGroundedKnowledgeReply(parsed.data.question, ragHits)
      : null;
  }
  if (contentContext && !contextGuardrail) {
    const reviewedLabel = contentContext.reviewed_at
      ? `，核验于 ${new Date(contentContext.reviewed_at).toLocaleDateString("zh-CN")}`
      : "";
    reply = {
      answer: `根据“${contentContext.title}”的已审核摘要（来源：${contentContext.source_name}${reviewedLabel}）：${contentContext.summary}`,
      nextStep: "需要确认活动报名、门诊安排或办理细节时，请打开官方原文；涉及个人健康判断请咨询家庭医生。",
      suggestDoctor: false,
      riskLevel: "low",
      category: "已审核内容解读",
      source: "knowledge",
      knowledgeIds: [contentContext.id],
    };
  } else if (generalGuardrail) {
    reply = generalGuardrail;
    skillIds = [...new Set([...skillIds, "safety-triage"] )];
  } else if (publicReply) {
    reply = publicReply;
    skillIds = [...new Set([...skillIds, "public-info-qa"] )];
  } else if (agentReply) {
    reply = agentReply;
  } else if (ragReply) {
    reply = ragReply;
    skillIds = [...new Set([...skillIds, "public-info-qa"] )];
  } else if (requiresCurrentSource) {
    reply = buildCurrentInfoNotFoundReply();
    skillIds = [...new Set([...skillIds, "public-info-qa"] )];
  } else {
    let residentMemory = null;
    const memoryOrgId = auth.profile.organization_id;
    if (memoryOrgId) {
      try {
        residentMemory = await Promise.race([
          buildMemoryContext({
            residentId: careSubject.residentId,
            organizationId: memoryOrgId,
            maxTokens: 2000,
            supabase: auth.supabase,
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
        ]);
      } catch {
        // Memory context is optional and never blocks the current answer.
      }
    }
    const legacyRequest = markTrustedAskRequest(
      new NextRequest(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify({
          question: parsed.data.question,
          residentId: careSubject?.residentId ?? parsed.data.residentId ?? null,
          serviceRequest: parsed.data.serviceRequest ?? inferredServiceRequest,
          confirmedWrite: false,
        }),
      }),
      residentMemory,
    );
    const legacyResponse = await legacyAskPost(legacyRequest);
    reply = await legacyResponse.json();
    if (!legacyResponse.ok)
      return apiError(
        "ASSISTANT_FAILED",
        "Claw 暂时没有回答成功。",
        legacyResponse.status,
        traceId,
      );

    // Async memory candidate extraction — uses Next.js after() for reliable
    // background execution in serverless environments.
    if (residentMemory && memoryOrgId) {
      const extractor = createMemoryExtractor();
      const capturedQuestion = parsed.data.question;
      const capturedResidentId = careSubject.residentId;
      const capturedOrgId = memoryOrgId;
      const capturedSupabase = auth.supabase;
      const capturedRecentMemories = residentMemory.relevantMemories;
      after(async () => {
        try {
          const candidate = await extractor.extract(capturedQuestion, {
            residentId: capturedResidentId,
            recentMemories: capturedRecentMemories,
          });
          if (candidate && candidate.should_store) {
            await saveCandidate({
              supabase: capturedSupabase,
              residentId: capturedResidentId,
              organizationId: capturedOrgId,
              candidate,
            });
          }
        } catch {
          // Graceful: extraction failure never affects response
        }
      });
    }
  }

  const { supabase, profile } = auth;

  const actions = buildAssistantActions({
    question: parsed.data.question,
    reply,
    serviceRequest: inferredServiceRequest,
  });
  if (contentContext && !contextGuardrail) {
    actions.unshift({
      id: `content-source-${contentContext.id}`,
      kind: "public_info",
      label: "查看这篇审核内容",
      description: `${contentContext.source_name} · 可核对原文与有效期`,
      href: `/content/${contentContext.id}`,
      requiresConfirmation: false,
    });
  }

  const activityDescriptor = buildAssistantActivity({
    reply,
    actions,
    serviceRequest: inferredServiceRequest,
    skillIds,
  });
  let activity = null;
  const activityPromise = supabase.rpc("record_assistant_activity", {
      p_resident_id: careSubject.residentId,
      p_activity_type: activityDescriptor.activityType,
      p_service_type: activityDescriptor.serviceType,
      p_risk_level: activityDescriptor.riskLevel,
      p_source: activityDescriptor.source,
      p_skill_ids: activityDescriptor.skillIds,
      p_knowledge_refs: activityDescriptor.knowledgeRefs,
      p_action_kinds: activityDescriptor.actionKinds,
      p_trace_id: traceId,
      p_channel:
        request.headers.get("x-client-platform") === "weapp"
          ? "wechat"
          : "web",
  });
  const skillRunPromise = profile && skillIds.length
    ? supabase.from("skill_runs").insert(
        skillIds.map((skillId) => ({
          user_id: profile.id,
          resident_id: careSubject.residentId,
          skill_id: skillId,
          skill_version: getSkillDefinition(skillId)?.version ?? "unknown",
          model: reply.source?.includes("model") || reply.source?.includes("kimi")
            ? getAiModelConfig("rag").model
            : "deterministic",
          trace_id: traceId,
          status: "success",
          source_refs: reply.knowledgeIds ?? [],
          metadata: { source: reply.source, category: reply.category, sourceContext: contentContext ? { type: "content", id: contentContext.id } : null },
        })),
      )
    : Promise.resolve(null);
  const [{ data: recordedActivity, error: activityError }] = await Promise.all([
    activityPromise,
    skillRunPromise,
  ]);
  if (!activityError && recordedActivity) {
    const recorded = recordedActivity as {
      activityId: string;
      occurredAt: string;
    };
    activity = presentAssistantActivity({
      id: recorded.activityId,
      activity_type: activityDescriptor.activityType,
      service_type: activityDescriptor.serviceType,
      risk_level: activityDescriptor.riskLevel,
      created_at: recorded.occurredAt,
    });
  }

  return apiOk(
    {
      reply,
      skillIds,
      actions,
      careSubject: careSubject?.selected ?? null,
      writePerformed: false,
      activity,
      rawTranscriptStored: false,
      draft: inferredServiceRequest,
    },
    traceId,
  );
}

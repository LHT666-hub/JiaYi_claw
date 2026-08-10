import { NextRequest } from "next/server";
import { z } from "zod";
import { POST as legacyAskPost } from "@/app/api/ask/route";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { buildAssistantActions } from "@/lib/assistant/actions";
import { resolveCareSubject } from "@/lib/careSubjects";
import { inferServiceRequestFromQuestion } from "@/lib/agent";
import { getGuardrailReply } from "@/lib/faq";
import { CURRENT_POLICY_VERSION } from "@/lib/policies";
import {
  buildVerifiedPublicInfoReply,
  searchPublicInfo,
} from "@/lib/publicInfoRepository";
import { routeSkillIds } from "@/lib/skills/registry";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const inputSchema = z.object({
  question: z.string().trim().min(1).max(3000),
  residentId: z.string().uuid().optional(),
  serviceRequest: z.unknown().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_MESSAGE", "请输入要咨询的问题。", 400, traceId);

  const skillIds = routeSkillIds(parsed.data.question);
  const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile) {
    const safetyReply = getGuardrailReply(parsed.data.question);
    const publicMatches = safetyReply
      ? []
      : await searchPublicInfo(parsed.data.question);
    const publicReply = publicMatches[0]
      ? buildVerifiedPublicInfoReply(publicMatches[0])
      : null;
    const reply = safetyReply ?? publicReply;
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
        skillIds: safetyReply ? ["safety-triage"] : ["public-info-qa"],
        actions: buildAssistantActions({
          question: parsed.data.question,
          reply,
          serviceRequest: null,
        }),
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
  {
    const { data: aiConsent, error: consentError } = await auth.supabase
      .from("consents")
      .select("granted")
      .eq("user_id", auth.profile.id)
      .eq("resident_id", careSubject.residentId)
      .eq("scope", "ai_processing")
      .eq("policy_version", CURRENT_POLICY_VERSION)
      .maybeSingle();
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
  const inferredServiceRequest = inferServiceRequestFromQuestion(
    parsed.data.question,
  );
  const legacyRequest = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      question: parsed.data.question,
      residentId: careSubject?.residentId ?? parsed.data.residentId ?? null,
      serviceRequest: parsed.data.serviceRequest ?? inferredServiceRequest,
      confirmedWrite: false,
    }),
  });
  const legacyResponse = await legacyAskPost(legacyRequest);
  const reply = await legacyResponse.json();
  if (!legacyResponse.ok)
    return apiError(
      "ASSISTANT_FAILED",
      "Claw 暂时没有回答成功。",
      legacyResponse.status,
      traceId,
    );

  const { supabase, profile } = auth;
  if (supabase && profile && skillIds.length) {
    await supabase.from("skill_runs").insert(
      skillIds.map((skillId) => ({
        user_id: profile.id,
        resident_id:
          careSubject?.residentId ??
          (profile.role === "resident" ? profile.id : null),
        skill_id: skillId,
        skill_version: "1.0.0",
        model: reply.source?.includes("kimi")
          ? (process.env.KIMI_MODEL ?? "kimi")
          : "deterministic",
        trace_id: traceId,
        status: "success",
        source_refs: reply.knowledgeIds ?? [],
        metadata: { source: reply.source, category: reply.category },
      })),
    );
  }

  const actions = buildAssistantActions({
    question: parsed.data.question,
    reply,
    serviceRequest: inferredServiceRequest,
  });

  return apiOk(
    {
      reply,
      skillIds,
      actions,
      careSubject: careSubject?.selected ?? null,
      writePerformed: false,
    },
    traceId,
  );
}

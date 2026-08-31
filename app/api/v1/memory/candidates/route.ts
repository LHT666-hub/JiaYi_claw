import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { resolveCareSubject } from "@/lib/careSubjects";
import { assertVerifiedResidentCareBinding } from "@/lib/db/carePlatform";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const MEMORY_TYPES = [
  "symptom_report",
  "medication_statement",
  "daily_living",
  "care_preference",
  "health_experience",
  "allergy_self_reported",
  "lifestyle",
] as const;

const EVIDENCE_LEVELS = [
  "self_reported",
  "user_uploaded",
  "staff_observed",
  "clinician_verified",
  "system_imported",
  "system_derived",
] as const;

const STAFF_ROLES = ["doctor", "nurse", "pharmacist", "community", "admin"] as const;

const getQuerySchema = z.object({
  resident_id: z.string().uuid().optional(),
  status: z.enum(["pending", "user_confirmed", "staff_confirmed", "rejected"]).optional(),
});

const postBodySchema = z.object({
  resident_id: z.string().uuid(),
  memory_type: z.enum(MEMORY_TYPES),
  content: z.record(z.string(), z.unknown()).or(z.unknown()),
  confidence: z.number().min(0).max(1).optional(),
  source_type: z.enum(["fact_candidate", "manual", "assistant_extraction"]).optional(),
  source_id: z.string().uuid().optional(),
  evidence_level: z.enum(EVIDENCE_LEVELS).optional(),
  occurred_at: z.string().datetime().optional(),
  deduplication_key: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) {
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  }

  const parsed = getQuerySchema.safeParse({
    resident_id: request.nextUrl.searchParams.get("resident_id") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return apiError("INVALID_PARAMETER", "查询参数格式不正确。", 400, traceId);
  }

  try {
    const { residentId, selected } = await resolveCareSubject(
      request,
      profile,
      supabase,
      parsed.data.resident_id ?? null,
    );
    await assertVerifiedResidentCareBinding(residentId, supabase);

    let query = supabase
      .from("resident_memories")
      .select("id,memory_type,content,confidence,source_type,evidence_level,occurred_at,confirmation_status,created_at,updated_at")
      .eq("resident_id", residentId)
      .order("created_at", { ascending: false })
      .limit(100);

    const status = parsed.data.status ?? "pending";
    if (status) {
      query = query.eq("confirmation_status", status);
    }

    const { data, error } = await query;
    if (error) {
      return apiError("CANDIDATE_LIST_FAILED", error.message, 500, traceId);
    }

    return apiOk({
      residentId,
      careSubject: selected,
      candidates: data ?? [],
    }, traceId);
  } catch (error) {
    const message = readErrorMessage(error);
    const verificationRequired = message.includes("CARE_BINDING_VERIFICATION_REQUIRED");
    const forbidden = verificationRequired || /FORBIDDEN|BOUND_RESIDENT_REQUIRED/.test(message);
    return apiError(
      verificationRequired
        ? "CARE_BINDING_VERIFICATION_REQUIRED"
        : forbidden
          ? "RESIDENT_SCOPE_FORBIDDEN"
          : "CANDIDATE_LIST_FAILED",
      verificationRequired
        ? "家医签约关系核验后才能读取候选记忆。"
        : forbidden
          ? "无权读取该居民的候选记忆。"
          : "候选记忆列表读取失败，请稍后重试。",
      forbidden ? 403 : 500,
      traceId,
    );
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) {
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  }

  // POST requires staff or agent identity.
  if (!STAFF_ROLES.includes(profile.role as typeof STAFF_ROLES[number])) {
    return apiError("CANDIDATE_CREATE_FORBIDDEN", "当前身份不能创建候选记忆。", 403, traceId);
  }

  const body = await request.json().catch(() => null);
  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("INVALID_CANDIDATE", "候选记忆信息不完整。", 400, traceId);
  }

  try {
    // Resolve the resident scope for the target resident.
    const { residentId } = await resolveCareSubject(
      request,
      profile,
      supabase,
      parsed.data.resident_id,
    );

    // Look up the resident's organization_id.
    const { data: residentProfile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", residentId)
      .maybeSingle();

    if (!residentProfile?.organization_id) {
      return apiError("RESIDENT_ORG_NOT_FOUND", "居民尚未绑定服务机构。", 400, traceId);
    }

    const { data, error } = await supabase.rpc("save_memory_candidate", {
      p_resident_id: residentId,
      p_organization_id: residentProfile.organization_id,
      p_memory_type: parsed.data.memory_type,
      p_content: parsed.data.content,
      p_confidence: parsed.data.confidence ?? null,
      p_source_type: parsed.data.source_type ?? null,
      p_source_id: parsed.data.source_id ?? null,
      p_evidence_level: parsed.data.evidence_level ?? "self_reported",
      p_occurred_at: parsed.data.occurred_at ?? null,
      p_deduplication_key: parsed.data.deduplication_key ?? null,
    });

    if (error) {
      const message = error.message;
      if (message.includes("CONSENT_REQUIRED")) {
        return apiError("MEMORY_CONSENT_REQUIRED", "居民尚未授予记忆存储授权。", 403, traceId);
      }
      if (message.includes("FORBIDDEN")) {
        return apiError("CANDIDATE_CREATE_FORBIDDEN", "无权为该居民创建候选记忆。", 403, traceId);
      }
      return apiError("CANDIDATE_CREATE_FAILED", error.message, 500, traceId);
    }

    if (!data) {
      return apiError("CANDIDATE_CREATE_FAILED", "候选记忆创建失败。", 500, traceId);
    }

    return apiOk({ candidate: data }, traceId, 201);
  } catch (error) {
    const message = readErrorMessage(error);
    const verificationRequired = message.includes("CARE_BINDING_VERIFICATION_REQUIRED");
    const forbidden = verificationRequired || /FORBIDDEN|BOUND_RESIDENT_REQUIRED/.test(message);
    return apiError(
      verificationRequired
        ? "CARE_BINDING_VERIFICATION_REQUIRED"
        : forbidden
          ? "RESIDENT_SCOPE_FORBIDDEN"
          : "CANDIDATE_CREATE_FAILED",
      verificationRequired
        ? "家医签约关系核验后才能创建候选记忆。"
        : forbidden
          ? "无权为该居民创建候选记忆。"
          : "候选记忆创建失败，请稍后重试。",
      forbidden ? 403 : 500,
      traceId,
    );
  }
}

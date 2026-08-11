import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { listFamilyBindingsForRole } from "@/lib/db/familyBindings";
import { CURRENT_POLICY_VERSION } from "@/lib/policies";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const redeemSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[2-9A-HJ-NP-Z]{8}$/),
  relationship: z.string().trim().min(1).max(20),
});
const revokeSchema = z.object({ bindingId: z.string().uuid() });

function createReadableCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(8);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  if (!["resident", "family", "admin"].includes(profile.role)) {
    return apiError("FAMILY_LINK_FORBIDDEN", "当前身份不使用家属绑定。", 403, traceId);
  }
  try {
    const bindings = await listFamilyBindingsForRole(profile.id, profile.role, supabase);
    return apiOk({ role: profile.role, bindings }, traceId);
  } catch {
    return apiError("FAMILY_LINK_LIST_FAILED", "家属关系暂时无法读取。", 500, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  if (profile.role !== "resident") return apiError("RESIDENT_REQUIRED", "只有居民本人可以生成家属授权码。", 403, traceId);

  const code = createReadableCode();
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const { data, error } = await supabase.rpc("create_family_link_code", {
    p_code_hash: hashCode(code),
    p_expires_at: expiresAt,
    p_policy_version: CURRENT_POLICY_VERSION,
  });
  if (error || !data) return apiError("FAMILY_LINK_CREATE_FAILED", "授权码生成失败，请稍后重试。", 400, traceId);
  return apiOk({ code, expiresAt }, traceId, 201);
}

export async function PUT(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  if (profile.role !== "family") return apiError("FAMILY_ROLE_REQUIRED", "请使用家属账号完成绑定。", 403, traceId);

  const parsed = redeemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_FAMILY_LINK", "请输入 8 位授权码和与居民的关系。", 400, traceId);
  const { data, error } = await supabase.rpc("redeem_family_link_code", {
    p_code_hash: hashCode(parsed.data.code),
    p_relationship: parsed.data.relationship,
  });
  if (error || !data) {
    const message = error?.message.includes("SCOPE_FORBIDDEN")
      ? "双方服务社区不一致，请联系家医团队核验。"
      : "授权码无效、已使用或已过期。";
    return apiError("FAMILY_LINK_REDEEM_FAILED", message, 400, traceId);
  }
  return apiOk({ binding: data }, traceId);
}

export async function DELETE(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile)
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  if (!["resident", "family", "admin"].includes(profile.role))
    return apiError("FAMILY_LINK_FORBIDDEN", "当前身份不能解除家属授权。", 403, traceId);

  const parsed = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_FAMILY_BINDING", "家属关系信息不完整。", 400, traceId);
  const { data, error } = await supabase.rpc("revoke_family_binding", {
    p_binding_id: parsed.data.bindingId,
  });
  if (error || !data) {
    if (error?.message.includes("FORBIDDEN"))
      return apiError("FAMILY_LINK_FORBIDDEN", "您无权解除该家属关系。", 403, traceId);
    if (error?.message.includes("NOT_FOUND"))
      return apiError("FAMILY_LINK_NOT_FOUND", "该家属关系不存在。", 404, traceId);
    return apiError("FAMILY_LINK_REVOKE_FAILED", "暂时无法解除授权，请稍后重试。", 500, traceId);
  }
  return apiOk({ binding: data }, traceId);
}

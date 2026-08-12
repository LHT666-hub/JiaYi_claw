import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { normalizeChinaPhone } from "@/lib/auth/phone";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const inviteSchema = z.object({
  phone: z.string().min(11).max(20),
  displayName: z.string().trim().min(2).max(60),
  role: z.enum(["doctor", "nurse", "pharmacist", "community", "admin"]),
  communityId: z.string().uuid().nullable().optional(),
  expiresInHours: z.number().int().min(1).max(168).default(48),
});

const statusSchema = z.object({
  profileId: z.string().uuid(),
  status: z.enum(["active", "disabled"]),
});

async function requireAdmin(request: NextRequest) {
  const auth = await getApiAuthContext(request);
  return auth.profile?.role === "admin" ? auth : null;
}

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await requireAdmin(request);
  if (!auth?.supabase || !auth.profile) return apiError("FORBIDDEN", "只有管理员可以管理人员。", 403, traceId);
  const [profilesResult, invitesResult, communitiesResult] = await Promise.all([
    auth.supabase.from("profiles").select("id,display_name,role,phone,community_id,account_status,created_at")
      .eq("organization_id", auth.profile.organization_id)
      .in("role", ["doctor", "nurse", "pharmacist", "community", "admin"])
      .order("created_at", { ascending: false }),
    auth.supabase.from("staff_invites").select("id,phone,display_name,role,community_id,status,expires_at,created_at")
      .eq("organization_id", auth.profile.organization_id).order("created_at", { ascending: false }),
    auth.supabase.from("communities").select("id,name").eq("organization_id", auth.profile.organization_id).order("name"),
  ]);
  const error = profilesResult.error ?? invitesResult.error ?? communitiesResult.error;
  return error ? apiError("STAFF_LIST_FAILED", error.message, 500, traceId) : apiOk({
    staff: profilesResult.data ?? [], invites: invitesResult.data ?? [], communities: communitiesResult.data ?? [],
  }, traceId);
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await requireAdmin(request);
  if (!auth?.supabase || !auth.profile?.organization_id) return apiError("FORBIDDEN", "只有管理员可以邀请人员。", 403, traceId);
  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_STAFF_INVITE", parsed.error.issues[0]?.message ?? "邀请信息不完整。", 400, traceId);
  if (parsed.data.communityId) {
    const { data: community } = await auth.supabase.from("communities").select("id")
      .eq("id", parsed.data.communityId).eq("organization_id", auth.profile.organization_id).maybeSingle();
    if (!community) return apiError("COMMUNITY_SCOPE_FORBIDDEN", "社区不属于当前机构。", 403, traceId);
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + parsed.data.expiresInHours * 3_600_000).toISOString();
  const { data, error } = await auth.supabase.rpc("create_staff_invite", {
    p_phone: normalizeChinaPhone(parsed.data.phone),
    p_display_name: parsed.data.displayName,
    p_role: parsed.data.role,
    p_community_id: parsed.data.communityId ?? auth.profile.community_id,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });
  if (error?.message.includes("ACTIVE_INVITE_EXISTS")) return apiError("ACTIVE_INVITE_EXISTS", "该手机号已有未过期邀请，请先撤销或等待过期。", 409, traceId);
  if (error) return apiError("STAFF_INVITE_CREATE_FAILED", "邀请暂时无法创建，请稍后重试。", 500, traceId);
  return apiOk({ invite: data, token }, traceId, 201);
}

export async function DELETE(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await requireAdmin(request);
  if (!auth?.supabase || !auth.profile?.organization_id) return apiError("FORBIDDEN", "只有管理员可以撤销邀请。", 403, traceId);
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return apiError("INVITE_ID_REQUIRED", "缺少邀请编号。", 400, traceId);
  const { data, error } = await auth.supabase.rpc("revoke_staff_invite", { p_invite_id: id });
  if (error?.message.includes("INVITE_NOT_PENDING")) return apiError("INVITE_NOT_FOUND", "邀请不存在或已处理。", 404, traceId);
  if (error) return apiError("STAFF_INVITE_REVOKE_FAILED", "邀请暂时无法撤销，请稍后重试。", 500, traceId);
  if (!data) return apiError("INVITE_NOT_FOUND", "邀请不存在或已处理。", 404, traceId);
  return apiOk({ revoked: true }, traceId);
}

export async function PATCH(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await requireAdmin(request);
  if (!auth?.supabase || !auth.profile?.organization_id) return apiError("FORBIDDEN", "只有管理员可以管理人员。", 403, traceId);
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_STAFF_STATUS", "人员状态参数不完整。", 400, traceId);
  const { data, error } = await auth.supabase.rpc("set_staff_account_status", {
    p_profile_id: parsed.data.profileId,
    p_status: parsed.data.status,
  });
  if (error?.message.includes("CANNOT_SUSPEND_SELF")) return apiError("CANNOT_DISABLE_SELF", "不能停用当前登录的管理员账号。", 400, traceId);
  if (error?.message.includes("STAFF_NOT_FOUND")) return apiError("STAFF_NOT_FOUND", "工作人员不存在或不属于当前机构。", 404, traceId);
  if (error) return apiError("STAFF_STATUS_UPDATE_FAILED", "账号状态暂时无法更新，请稍后重试。", 400, traceId);
  return apiOk({ staff: data }, traceId);
}

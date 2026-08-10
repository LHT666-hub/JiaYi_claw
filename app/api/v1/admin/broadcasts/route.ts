import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const schema = z.object({ channelGroupId: z.string().uuid(), contentItemId: z.string().uuid().nullable().optional(), title: z.string().trim().min(2).max(120), body: z.string().trim().min(2).max(2000), linkUrl: z.string().url().nullable().optional(), scheduledAt: z.string().datetime(), confirmed: z.literal(true) });
export async function GET(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile || !["admin", "community"].includes(auth.profile.role)) return apiError("FORBIDDEN", "没有群通知管理权限。", 403, traceId);
  const { data, error } = await auth.supabase.from("scheduled_broadcasts").select("*,channel_group:channel_groups(name)").eq("organization_id", auth.profile.organization_id).order("scheduled_at", { ascending: false }).limit(100);
  return error ? apiError("BROADCAST_LIST_FAILED", error.message, 500, traceId) : apiOk({ broadcasts: data ?? [] }, traceId);
}
export async function POST(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile || !["admin", "community"].includes(auth.profile.role)) return apiError("FORBIDDEN", "没有群通知管理权限。", 403, traceId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_BROADCAST", "群通知信息不完整。", 400, traceId);
  const { data: group } = await auth.supabase.from("channel_groups").select("id,channel_account:channel_accounts!inner(organization_id)").eq("id", parsed.data.channelGroupId).maybeSingle();
  const account = Array.isArray(group?.channel_account) ? group.channel_account[0] : group?.channel_account;
  if (!group || account?.organization_id !== auth.profile.organization_id) return apiError("GROUP_SCOPE_FORBIDDEN", "群不属于当前组织。", 403, traceId);
  if (parsed.data.contentItemId) {
    const { data: item } = await auth.supabase.from("content_items").select("id").eq("id", parsed.data.contentItemId).eq("status", "published").maybeSingle();
    if (!item) return apiError("CONTENT_NOT_PUBLISHED", "只能发送审核通过的内容。", 400, traceId);
  }
  const { data, error } = await auth.supabase.from("scheduled_broadcasts").insert({ organization_id: auth.profile.organization_id, channel_group_id: group.id, content_item_id: parsed.data.contentItemId ?? null, title: parsed.data.title, body: parsed.data.body, link_url: parsed.data.linkUrl ?? null, scheduled_at: parsed.data.scheduledAt, status: "scheduled", created_by: auth.profile.id }).select("*").single();
  return error ? apiError("BROADCAST_CREATE_FAILED", error.message, 500, traceId) : apiOk({ broadcast: data }, traceId, 201);
}

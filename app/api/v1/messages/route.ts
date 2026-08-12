import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { residentShowcaseMessages } from "@/lib/showcase/resident";

const updateSchema = z.object({ id: z.string().uuid().optional(), markAllRead: z.boolean().optional() }).refine((value) => value.id || value.markAllRead, "操作无效");
export async function GET(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile) {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return apiOk(residentShowcaseMessages, traceId);
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  }
  const [notifications, channels] = await Promise.all([
    auth.supabase.from("notifications").select("id,type,title,content,link_url,is_read,metadata,created_at").eq("user_id", auth.profile.id).order("created_at", { ascending: false }).limit(100),
    auth.supabase.from("channel_members").select("id,display_name,binding_status,bound_at,channel_account:channel_accounts(name,channel_type,status)").eq("resident_id", auth.profile.id).eq("binding_status", "bound"),
  ]);
  const error = notifications.error ?? channels.error;
  return error ? apiError("MESSAGE_LIST_FAILED", error.message, 500, traceId) : apiOk({ messages: notifications.data ?? [], channelBindings: channels.data ?? [] }, traceId);
}
export async function PATCH(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_MESSAGE_ACTION", "消息操作无效。", 400, traceId);
  let query = auth.supabase.from("notifications").update({ is_read: true }).eq("user_id", auth.profile.id);
  if (parsed.data.id) query = query.eq("id", parsed.data.id);
  const { error } = await query;
  return error ? apiError("MESSAGE_UPDATE_FAILED", error.message, 500, traceId) : apiOk({ updated: true }, traceId);
}

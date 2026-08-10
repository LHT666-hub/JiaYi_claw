import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const accountSchema = z.object({ name: z.string().trim().min(2).max(100), corpId: z.string().trim().min(2).max(100), agentId: z.string().trim().max(100).nullable().optional(), receiveCapability: z.enum(["outbound_only", "callback", "archive"]).default("outbound_only") });
export async function GET(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || auth.profile?.role !== "admin") return apiError("FORBIDDEN", "只有管理员可以管理企业微信渠道。", 403, traceId);
  const [accounts, groups] = await Promise.all([
    auth.supabase.from("channel_accounts").select("id,name,corp_id,agent_id,receive_capability,status,created_at").eq("organization_id", auth.profile.organization_id),
    auth.supabase.from("channel_groups").select("id,name,external_group_id,status,channel_account_id,channel_account:channel_accounts!inner(organization_id)").eq("channel_account.organization_id", auth.profile.organization_id).order("created_at", { ascending: false }),
  ]);
  const error = accounts.error ?? groups.error;
  return error ? apiError("CHANNEL_LIST_FAILED", error.message, 500, traceId) : apiOk({ accounts: accounts.data ?? [], groups: groups.data ?? [], callbackConfigured: Boolean(process.env.WECOM_CALLBACK_TOKEN && process.env.WECOM_ENCODING_AES_KEY), outboundConfigured: Boolean(process.env.WECOM_GROUP_WEBHOOK_URL) }, traceId);
}
export async function POST(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || auth.profile?.role !== "admin") return apiError("FORBIDDEN", "只有管理员可以管理企业微信渠道。", 403, traceId);
  const parsed = accountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_CHANNEL_ACCOUNT", "企业微信账号信息无效。", 400, traceId);
  const { data, error } = await auth.supabase.from("channel_accounts").upsert({ organization_id: auth.profile.organization_id, community_id: auth.profile.community_id, channel_type: "wecom", name: parsed.data.name, corp_id: parsed.data.corpId, agent_id: parsed.data.agentId ?? null, receive_capability: parsed.data.receiveCapability, status: "active" }, { onConflict: "organization_id,channel_type,corp_id" }).select("id,name,corp_id,receive_capability,status").single();
  return error ? apiError("CHANNEL_SAVE_FAILED", error.message, 500, traceId) : apiOk({ account: data }, traceId, 201);
}

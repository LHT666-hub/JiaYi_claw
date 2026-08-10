import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { resolveResidentScope } from "@/lib/db/carePlatform";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const schema = z.object({ accountId: z.string().uuid(), externalUserId: z.string().trim().min(1).max(160), residentId: z.string().uuid().optional(), confirmed: z.literal(true) });
export async function POST(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_CHANNEL_BINDING", "渠道绑定信息无效。", 400, traceId);
  try {
    const residentId = await resolveResidentScope(auth.profile, auth.supabase, parsed.data.residentId);
    const { data: account } = await auth.supabase.from("channel_accounts").select("id").eq("id", parsed.data.accountId).eq("organization_id", auth.profile.organization_id).eq("status", "active").maybeSingle();
    if (!account) return apiError("CHANNEL_ACCOUNT_NOT_FOUND", "企业微信渠道尚未启用。", 404, traceId);
    const { data, error } = await auth.supabase.rpc("bind_channel_member", { p_account_id: account.id, p_external_user_id: parsed.data.externalUserId, p_resident_id: residentId });
    if (error) throw error;
    return data ? apiOk({ binding: data }, traceId) : apiError("CHANNEL_MEMBER_NOT_FOUND", "尚未在该企业微信群识别到此成员。", 404, traceId);
  } catch (error) { return apiError("CHANNEL_BIND_FAILED", error instanceof Error ? error.message : "绑定失败。", 400, traceId); }
}

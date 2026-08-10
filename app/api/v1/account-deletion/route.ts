import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const actionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), reason: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("cancel") }),
]);

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);

  const { data, error } = await supabase.from("account_deletion_requests").select("*")
    .eq("user_id", profile.id).order("requested_at", { ascending: false }).limit(1).maybeSingle();
  return error
    ? apiError("ACCOUNT_DELETION_READ_FAILED", "暂时无法读取注销状态。", 500, traceId)
    : apiOk({ request: data ?? null }, traceId);
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  const parsed = actionInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_DELETION_ACTION", "注销操作信息不完整。", 400, traceId);

  const rpc = parsed.data.action === "request"
    ? await supabase.rpc("request_my_account_deletion", { p_reason: parsed.data.reason ?? null })
    : await supabase.rpc("cancel_my_account_deletion");

  if (rpc.error) {
    if (rpc.error.message.includes("STAFF_OFFBOARDING_REQUIRED")) {
      return apiError("STAFF_OFFBOARDING_REQUIRED", "工作人员账号需由机构管理员办理离职停用。", 403, traceId);
    }
    if (rpc.error.message.includes("NO_PENDING_DELETION")) {
      return apiError("NO_PENDING_DELETION", "当前没有可撤销的注销申请。", 409, traceId);
    }
    return apiError("ACCOUNT_DELETION_SAVE_FAILED", "注销申请暂时无法处理，请稍后重试。", 500, traceId);
  }
  return apiOk({ request: rpc.data }, traceId);
}

import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const inputSchema = z.object({ token: z.string().min(20).max(300) });

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先完成手机号验证。", 401, traceId);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INVITE", "邀请链接不完整。", 400, traceId);
  const { data, error } = await supabase.rpc("accept_staff_invite", { p_token: parsed.data.token });
  return error
    ? apiError("INVITE_ACCEPT_FAILED", "邀请无效、已过期，或手机号与邀请不一致。", 400, traceId)
    : apiOk({ profile: data }, traceId);
}

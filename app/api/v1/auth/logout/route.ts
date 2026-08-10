import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const traceId = createTraceId();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return apiError("AUTH_NOT_CONFIGURED", "账号服务尚未配置。", 503, traceId);
  await supabase.auth.signOut();
  return apiOk({ signedOut: true }, traceId);
}

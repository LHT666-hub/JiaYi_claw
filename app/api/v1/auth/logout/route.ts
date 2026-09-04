import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SHOWCASE_ROLE_COOKIE } from "@/lib/showcase/session";

export async function POST() {
  const traceId = createTraceId();
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    const response = apiOk({ signedOut: true, demo: true }, traceId);
    response.cookies.set(SHOWCASE_ROLE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return apiError("AUTH_NOT_CONFIGURED", "账号服务尚未配置。", 503, traceId);
  await supabase.auth.signOut();
  return apiOk({ signedOut: true }, traceId);
}

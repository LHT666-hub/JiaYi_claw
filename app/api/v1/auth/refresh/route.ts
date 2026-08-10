import { z } from "zod";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const inputSchema = z.object({ refreshToken: z.string().min(20) });

export async function POST(request: Request) {
  const traceId = createTraceId();
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_REFRESH_TOKEN", "登录状态无效。", 400, traceId);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return apiError("AUTH_NOT_CONFIGURED", "账号服务尚未配置。", 503, traceId);
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: parsed.data.refreshToken });
  if (error || !data.session) return apiError("SESSION_EXPIRED", "登录已过期，请重新验证手机号。", 401, traceId);
  return apiOk({
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    },
  }, traceId);
}

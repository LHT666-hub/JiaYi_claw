import { z } from "zod";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { normalizeChinaPhone } from "@/lib/auth/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const inputSchema = z.object({ phone: z.string(), token: z.string().regex(/^\d{6,10}$/) });

export async function POST(request: Request) {
  const traceId = createTraceId();
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_OTP", "请输入收到的验证码。", 400, traceId);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return apiError("AUTH_NOT_CONFIGURED", "账号服务尚未配置。", 503, traceId);
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalizeChinaPhone(parsed.data.phone),
      token: parsed.data.token,
      type: "sms",
    });
    if (error || !data.session || !data.user) throw error ?? new Error("SESSION_MISSING");
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
    const isWechatClient = request.headers.get("x-client-platform") === "weapp";
    return apiOk({
      profile,
      needsOnboarding: !profile?.onboarding_completed_at,
      ...(isWechatClient ? {
        session: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at,
        },
      } : {}),
    }, traceId);
  } catch {
    return apiError("OTP_VERIFY_FAILED", "验证码无效或已经过期。", 400, traceId);
  }
}

import { z } from "zod";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { maskPhone, normalizeChinaPhone } from "@/lib/auth/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  phone: z.string().min(6).max(30),
});

export async function POST(request: Request) {
  const traceId = createTraceId();
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_REQUEST", "请输入正确的手机号。", 400, traceId);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return apiError("AUTH_NOT_CONFIGURED", "账号服务尚未配置。", 503, traceId);
  try {
    const phone = normalizeChinaPhone(parsed.data.phone);
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        shouldCreateUser: true,
      },
    });
    if (error) throw error;
    return apiOk({ phone: maskPhone(phone), retryAfterSeconds: 60 }, traceId);
  } catch (error) {
    const message = error instanceof Error && error.message === "INVALID_PHONE" ? "手机号格式不正确。" : "验证码暂时没有发送成功，请稍后重试。";
    return apiError("OTP_SEND_FAILED", message, 400, traceId);
  }
}

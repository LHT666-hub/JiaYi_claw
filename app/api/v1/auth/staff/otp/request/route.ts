import { z } from "zod";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { maskPhone, normalizeChinaPhone } from "@/lib/auth/phone";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

const inputSchema = z.object({ phone: z.string().min(6).max(30) });
const staffRoles = ["doctor", "nurse", "pharmacist", "community", "admin"];

export async function POST(request: Request) {
  const traceId = createTraceId();
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_REQUEST", "请输入正确的手机号。", 400, traceId);

  const supabase = await createSupabaseServerClient();
  const service = createSupabaseServiceRoleClient();
  if (!supabase || !service)
    return apiError("AUTH_NOT_CONFIGURED", "账号服务尚未配置。", 503, traceId);

  try {
    const phone = normalizeChinaPhone(parsed.data.phone);
    const { data: profile, error: lookupError } = await service
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .in("role", staffRoles)
      .eq("account_status", "active")
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (profile) {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
    }

    return apiOk(
      { phone: maskPhone(phone), retryAfterSeconds: 60 },
      traceId,
    );
  } catch (error) {
    const invalidPhone =
      error instanceof Error && error.message === "INVALID_PHONE";
    return apiError(
      "OTP_SEND_FAILED",
      invalidPhone
        ? "手机号格式不正确。"
        : "验证码暂时没有发送成功，请稍后重试。",
      invalidPhone ? 400 : 503,
      traceId,
    );
  }
}

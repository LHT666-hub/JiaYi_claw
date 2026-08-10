import { z } from "zod";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { normalizeChinaPhone } from "@/lib/auth/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  phone: z.string(),
  token: z.string().regex(/^\d{6,10}$/),
});
const staffRoles = ["doctor", "nurse", "pharmacist", "community", "admin"];

export async function POST(request: Request) {
  const traceId = createTraceId();
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_OTP", "请输入收到的验证码。", 400, traceId);

  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return apiError("AUTH_NOT_CONFIGURED", "账号服务尚未配置。", 503, traceId);

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalizeChinaPhone(parsed.data.phone),
      token: parsed.data.token,
      type: "sms",
    });
    if (error || !data.user) throw error ?? new Error("SESSION_MISSING");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id,display_name,role,organization_id,community_id,account_status,onboarding_completed_at",
      )
      .eq("id", data.user.id)
      .single();
    if (
      profileError ||
      !profile ||
      !staffRoles.includes(profile.role) ||
      profile.account_status !== "active"
    ) {
      await supabase.auth.signOut();
      return apiError(
        "STAFF_ACCOUNT_REQUIRED",
        "该手机号尚未开通工作人员账号，请联系机构管理员。",
        403,
        traceId,
      );
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      actor_id: profile.id,
      action: "auth.staff_phone_login",
      target_table: "profiles",
      target_id: profile.id,
      detail: { role: profile.role, traceId },
    });
    if (auditError) {
      await supabase.auth.signOut();
      return apiError(
        "AUDIT_WRITE_FAILED",
        "暂时无法安全建立工作台会话，请稍后重试。",
        503,
        traceId,
      );
    }

    return apiOk(
      {
        profile,
        destination: profile.role === "admin" ? "/admin" : "/doctor",
      },
      traceId,
    );
  } catch {
    return apiError(
      "OTP_VERIFY_FAILED",
      "验证码无效或已经过期。",
      400,
      traceId,
    );
  }
}

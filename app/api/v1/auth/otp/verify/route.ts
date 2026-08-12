import { createHash } from "node:crypto";
import { z } from "zod";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { normalizeChinaPhone } from "@/lib/auth/phone";
import { CURRENT_POLICY_VERSION } from "@/lib/policies";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  phone: z.string(),
  token: z.string().regex(/^\d{6,10}$/),
  privacyAccepted: z.boolean().optional(),
  policyVersion: z.string().optional(),
  inviteToken: z.string().min(20).max(300).optional(),
});

export async function POST(request: Request) {
  const traceId = createTraceId();
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_OTP", "请输入收到的验证码。", 400, traceId);
  const audience = request.headers.get("x-auth-audience") === "staff" ? "staff" : "resident";
  if (audience === "resident" && (
    parsed.data.privacyAccepted !== true
    || parsed.data.policyVersion !== CURRENT_POLICY_VERSION
  )) {
    return apiError("PRIVACY_ACCEPTANCE_REQUIRED", "请先阅读并同意当前隐私政策与用户协议。", 400, traceId);
  }
  if (audience === "staff") {
    const service = createSupabaseServiceRoleClient();
    if (!service || !parsed.data.inviteToken) {
      return apiError("STAFF_INVITE_REQUIRED", "请从有效的机构邀请链接进入。", 403, traceId);
    }
    const tokenHash = createHash("sha256").update(parsed.data.inviteToken).digest("hex");
    const phone = normalizeChinaPhone(parsed.data.phone);
    const { data: invite } = await service
      .from("staff_invites")
      .select("id")
      .eq("token_hash", tokenHash)
      .eq("phone", phone)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!invite) {
      return apiError("STAFF_INVITE_INVALID", "邀请已失效，或手机号与邀请不一致。", 403, traceId);
    }
  }
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
    if (audience === "resident") {
      if (!profile || !["resident", "family"].includes(profile.role) || profile.account_status !== "active") {
        await supabase.auth.signOut();
        return apiError("RESIDENT_LOGIN_FORBIDDEN", "该账号不能从居民端登录。", 403, traceId);
      }
      const { error: consentError } = await supabase.rpc("record_login_privacy_consent", {
        p_policy_version: CURRENT_POLICY_VERSION,
        p_channel: "sms",
      });
      if (consentError) throw consentError;
    }
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
    await supabase.auth.signOut().catch(() => undefined);
    return apiError("OTP_VERIFY_FAILED", "验证码无效或已经过期。", 400, traceId);
  }
}

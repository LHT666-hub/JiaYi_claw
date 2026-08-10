import { createHash } from "node:crypto";
import { z } from "zod";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { exchangeWechatIdentity } from "@/lib/auth/wechat";
import { createSupabasePublicServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  loginCode: z.string().trim().min(6).max(200),
  phoneCode: z.string().trim().min(6).max(300),
});

function internalEmail(userId: string) {
  const digest = createHash("sha256").update(userId).digest("hex").slice(0, 32);
  return `wechat-${digest}@auth.jiayi.local`;
}

export async function POST(request: Request) {
  const traceId = createTraceId();
  if (request.headers.get("x-client-platform") !== "weapp") {
    return apiError("WECHAT_CLIENT_REQUIRED", "该登录方式仅用于微信小程序。", 400, traceId);
  }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_WECHAT_LOGIN", "微信登录凭证不完整，请重试。", 400, traceId);

  const appId = process.env.WECHAT_MINIPROGRAM_APP_ID?.trim();
  const appSecret = process.env.WECHAT_MINIPROGRAM_APP_SECRET?.trim();
  const service = createSupabaseServiceRoleClient();
  const publicClient = createSupabasePublicServerClient();
  if (!appId || !appSecret || !service || !publicClient) {
    return apiError("WECHAT_LOGIN_NOT_CONFIGURED", "微信一键登录尚未配置，请暂时使用短信验证码。", 503, traceId);
  }

  try {
    const wechat = await exchangeWechatIdentity({
      appId,
      appSecret,
      loginCode: parsed.data.loginCode,
      phoneCode: parsed.data.phoneCode,
    });

    const { data: mappedIdentity } = await service
      .from("wechat_identities")
      .select("user_id")
      .eq("app_id", appId)
      .eq("open_id", wechat.openId)
      .maybeSingle();

    let userId = mappedIdentity?.user_id as string | undefined;
    if (!userId) {
      const { data: phoneUserId, error: phoneLookupError } = await service.rpc("find_auth_user_by_phone", { p_phone: wechat.phone });
      if (phoneLookupError) throw phoneLookupError;
      userId = phoneUserId as string | undefined;
    }

    if (!userId) {
      const { data: created, error: createError } = await service.auth.admin.createUser({
        phone: wechat.phone,
        phone_confirm: true,
        email: `wechat-${createHash("sha256").update(`${appId}:${wechat.openId}`).digest("hex").slice(0, 32)}@auth.jiayi.local`,
        email_confirm: true,
        user_metadata: { auth_channel: "wechat_miniprogram" },
      });
      if (createError || !created.user) throw createError ?? new Error("WECHAT_USER_CREATE_FAILED");
      userId = created.user.id;
    }

    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("id,display_name,role,organization_id,community_id,account_status,onboarding_completed_at")
      .eq("id", userId)
      .single();
    if (profileError || !profile) throw profileError ?? new Error("PROFILE_MISSING");
    if (!["resident", "family"].includes(profile.role) || profile.account_status !== "active") {
      return apiError("WECHAT_ACCOUNT_FORBIDDEN", "该手机号对应的账号不能使用居民端微信登录。", 403, traceId);
    }

    const { error: identityError } = await service.from("wechat_identities").upsert({
      user_id: userId,
      app_id: appId,
      open_id: wechat.openId,
      union_id: wechat.unionId,
      phone: wechat.phone,
      last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "app_id,open_id" });
    if (identityError) throw identityError;

    const { data: authUser, error: userError } = await service.auth.admin.getUserById(userId);
    if (userError || !authUser.user) throw userError ?? new Error("AUTH_USER_MISSING");
    let email = authUser.user.email;
    if (!email) {
      email = internalEmail(userId);
      const { error: updateError } = await service.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (updateError) throw updateError;
    }

    const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link.properties?.hashed_token;
    if (linkError || !tokenHash) throw linkError ?? new Error("SESSION_LINK_FAILED");
    const { data: verified, error: verifyError } = await publicClient.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (verifyError || !verified.session) throw verifyError ?? new Error("SESSION_CREATE_FAILED");

    await service.from("audit_logs").insert({
      actor_id: userId,
      action: "auth.wechat_login",
      target_table: "wechat_identities",
      target_id: userId,
      detail: { app_id: appId, channel: "miniprogram" },
    });

    return apiOk({
      profile,
      needsOnboarding: !profile.onboarding_completed_at,
      session: {
        accessToken: verified.session.access_token,
        refreshToken: verified.session.refresh_token,
        expiresAt: verified.session.expires_at,
      },
    }, traceId);
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":")[0] : "WECHAT_LOGIN_FAILED";
    const isWechatError = code.startsWith("WECHAT_");
    return apiError("WECHAT_LOGIN_FAILED", isWechatError ? "微信授权已失效，请重新点击一键登录。" : "微信登录暂时不可用，请使用短信验证码。", 400, traceId);
  }
}

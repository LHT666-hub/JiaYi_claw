import { getSupabaseUrl, isSupabaseConfigured, isSupabaseServiceRoleConfigured } from "@/lib/supabase/env";

export type AuthChannelCapability = {
  available: boolean;
  label: string;
  unavailableMessage: string | null;
};

function hasAll(...values: Array<string | undefined>) {
  return values.every((value) => Boolean(value?.trim()));
}

function usesLocalSupabase() {
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(
      new URL(getSupabaseUrl()).hostname.toLowerCase(),
    );
  } catch {
    return false;
  }
}

export function isTencentSmsConfigured() {
  return hasAll(
    process.env.SUPABASE_SEND_SMS_HOOK_SECRET,
    process.env.TENCENT_SMS_SECRET_ID,
    process.env.TENCENT_SMS_SECRET_KEY,
    process.env.TENCENT_SMS_APP_ID,
    process.env.TENCENT_SMS_SIGN_NAME,
    process.env.TENCENT_SMS_TEMPLATE_ID,
  );
}

export function isWechatLoginConfigured() {
  return (
    isSupabaseConfigured() &&
    isSupabaseServiceRoleConfigured() &&
    hasAll(
      process.env.WECHAT_MINIPROGRAM_APP_ID,
      process.env.WECHAT_MINIPROGRAM_APP_SECRET,
    )
  );
}

export function getAuthCapabilities() {
  const smsAvailable = isSupabaseConfigured() && (usesLocalSupabase() || isTencentSmsConfigured());
  const wechatAvailable = isWechatLoginConfigured();
  return {
    sms: {
      available: smsAvailable,
      label: "短信验证码",
      unavailableMessage: smsAvailable ? null : "短信登录正在开通，请稍后再试。",
    } satisfies AuthChannelCapability,
    staffSms: {
      available: smsAvailable,
      label: "工作人员短信验证",
      unavailableMessage: smsAvailable ? null : "机构登录通道正在配置，请联系管理员。",
    } satisfies AuthChannelCapability,
    wechat: {
      available: wechatAvailable,
      label: "微信手机号一键登录",
      unavailableMessage: wechatAvailable ? null : "微信一键登录尚未完成配置。",
    } satisfies AuthChannelCapability,
    preferredResidentChannel: wechatAvailable ? "wechat" as const : smsAvailable ? "sms" as const : null,
  };
}

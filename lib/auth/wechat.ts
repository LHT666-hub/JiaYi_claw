import { normalizeChinaPhone } from "./phone";

type WechatSession = { openid?: string; unionid?: string; errcode?: number; errmsg?: string };
type WechatToken = { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string };
type WechatPhone = {
  errcode?: number;
  errmsg?: string;
  phone_info?: { phoneNumber?: string; purePhoneNumber?: string; countryCode?: string };
};

function assertWechatSuccess(payload: { errcode?: number; errmsg?: string }, fallback: string) {
  if (payload.errcode && payload.errcode !== 0) throw new Error(`${fallback}:${payload.errcode}`);
}

export async function exchangeWechatIdentity(params: {
  appId: string;
  appSecret: string;
  loginCode: string;
  phoneCode: string;
}) {
  const sessionUrl = new URL("https://api.weixin.qq.com/sns/jscode2session");
  sessionUrl.searchParams.set("appid", params.appId);
  sessionUrl.searchParams.set("secret", params.appSecret);
  sessionUrl.searchParams.set("js_code", params.loginCode);
  sessionUrl.searchParams.set("grant_type", "authorization_code");

  const [sessionResponse, tokenResponse] = await Promise.all([
    fetch(sessionUrl, { cache: "no-store", signal: AbortSignal.timeout(4500) }),
    fetch("https://api.weixin.qq.com/cgi-bin/stable_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credential", appid: params.appId, secret: params.appSecret, force_refresh: false }),
      cache: "no-store",
      signal: AbortSignal.timeout(4500),
    }),
  ]);
  if (!sessionResponse.ok || !tokenResponse.ok) throw new Error("WECHAT_NETWORK_FAILED");
  const session = await sessionResponse.json() as WechatSession;
  const token = await tokenResponse.json() as WechatToken;
  assertWechatSuccess(session, "WECHAT_SESSION_FAILED");
  assertWechatSuccess(token, "WECHAT_TOKEN_FAILED");
  if (!session.openid || !token.access_token) throw new Error("WECHAT_RESPONSE_INCOMPLETE");

  const phoneResponse = await fetch(`https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token.access_token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: params.phoneCode }),
    cache: "no-store",
    signal: AbortSignal.timeout(4500),
  });
  if (!phoneResponse.ok) throw new Error("WECHAT_PHONE_NETWORK_FAILED");
  const phonePayload = await phoneResponse.json() as WechatPhone;
  assertWechatSuccess(phonePayload, "WECHAT_PHONE_FAILED");
  const purePhone = phonePayload.phone_info?.purePhoneNumber ?? phonePayload.phone_info?.phoneNumber;
  if (!purePhone) throw new Error("WECHAT_PHONE_MISSING");

  return {
    openId: session.openid,
    unionId: session.unionid ?? null,
    phone: normalizeChinaPhone(purePhone),
  };
}

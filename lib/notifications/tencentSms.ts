import { createHash, createHmac } from "node:crypto";

const host = "sms.tencentcloudapi.com";
const service = "sms";
const algorithm = "TC3-HMAC-SHA256";
const version = "2021-01-11";

export type TencentSmsConfig = {
  secretId: string;
  secretKey: string;
  appId: string;
  signName: string;
  templateId: string;
  region: string;
  securityToken?: string;
  templateParamKeys: Array<"otp" | "ttlMinutes">;
  ttlMinutes: number;
};

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacBuffer(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function utcDate(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

export function parseTencentSmsConfig(
  env: Record<string, string | undefined> = process.env,
): TencentSmsConfig {
  const required = {
    secretId: env.TENCENT_SMS_SECRET_ID?.trim(),
    secretKey: env.TENCENT_SMS_SECRET_KEY?.trim(),
    appId: env.TENCENT_SMS_APP_ID?.trim(),
    signName: env.TENCENT_SMS_SIGN_NAME?.trim(),
    templateId: env.TENCENT_SMS_TEMPLATE_ID?.trim(),
  };
  if (Object.values(required).some((value) => !value))
    throw new Error("TENCENT_SMS_NOT_CONFIGURED");

  const templateParamKeys = (env.TENCENT_SMS_TEMPLATE_PARAM_KEYS?.trim() || "otp")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!templateParamKeys.length || templateParamKeys.some((key) => !["otp", "ttlMinutes"].includes(key)))
    throw new Error("TENCENT_SMS_TEMPLATE_PARAMS_INVALID");

  const ttlMinutes = Number(env.TENCENT_SMS_OTP_TTL_MINUTES ?? "5");
  if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 30)
    throw new Error("TENCENT_SMS_TTL_INVALID");

  return {
    secretId: required.secretId!,
    secretKey: required.secretKey!,
    appId: required.appId!,
    signName: required.signName!,
    templateId: required.templateId!,
    region: env.TENCENT_SMS_REGION?.trim() || "ap-guangzhou",
    securityToken: env.TENCENT_SMS_SECURITY_TOKEN?.trim() || undefined,
    templateParamKeys: templateParamKeys as Array<"otp" | "ttlMinutes">,
    ttlMinutes,
  };
}

export function buildTencentSmsRequest(params: {
  phone: string;
  otp: string;
  config: TencentSmsConfig;
  timestamp?: number;
  sessionContext?: string;
}) {
  const timestamp = params.timestamp ?? Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    PhoneNumberSet: [params.phone],
    SmsSdkAppId: params.config.appId,
    SignName: params.config.signName,
    TemplateId: params.config.templateId,
    TemplateParamSet: params.config.templateParamKeys.map((key) =>
      key === "otp" ? params.otp : String(params.config.ttlMinutes),
    ),
    ...(params.sessionContext ? { SessionContext: params.sessionContext.slice(0, 128) } : {}),
  });
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join("\n");
  const date = utcDate(timestamp);
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const secretDate = hmacBuffer(`TC3${params.config.secretKey}`, date);
  const secretService = hmacBuffer(secretDate, service);
  const secretSigning = hmacBuffer(secretService, "tc3_request");
  const signature = hmacHex(secretSigning, stringToSign);
  const authorization = `${algorithm} Credential=${params.config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `https://${host}/`,
    body: payload,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: host,
      "X-TC-Action": "SendSms",
      "X-TC-Version": version,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Region": params.config.region,
      ...(params.config.securityToken ? { "X-TC-Token": params.config.securityToken } : {}),
    },
  };
}

type TencentSmsResponse = {
  Response?: {
    Error?: { Code?: string };
    SendStatusSet?: Array<{ Code?: string }>;
    RequestId?: string;
  };
};

export async function sendTencentOtp(params: {
  phone: string;
  otp: string;
  traceId: string;
  fetchImpl?: typeof fetch;
}) {
  const config = parseTencentSmsConfig();
  const request = buildTencentSmsRequest({
    phone: params.phone,
    otp: params.otp,
    config,
    sessionContext: params.traceId,
  });
  const response = await (params.fetchImpl ?? fetch)(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
    cache: "no-store",
    signal: AbortSignal.timeout(4_500),
  });
  if (!response.ok) throw new Error("TENCENT_SMS_HTTP_FAILED");
  const payload = await response.json() as TencentSmsResponse;
  const providerCode = payload.Response?.Error?.Code ?? payload.Response?.SendStatusSet?.[0]?.Code;
  if (providerCode !== "Ok") {
    const safeCode = providerCode?.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80) || "UNKNOWN";
    throw new Error(`TENCENT_SMS_PROVIDER_FAILED:${safeCode}`);
  }
  return { requestId: payload.Response?.RequestId ?? null };
}

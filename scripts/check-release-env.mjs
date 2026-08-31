const required = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TARO_APP_API_BASE_URL",
  "WECHAT_MINIPROGRAM_APP_ID",
  "WECHAT_MINIPROGRAM_APP_SECRET",
  "WECHAT_SUBSCRIBE_SERVICE_TEMPLATE_ID",
  "WECHAT_SUBSCRIBE_SERVICE_FIELD_MAP",
  "NEXT_PUBLIC_OPERATOR_NAME",
  "NEXT_PUBLIC_PRIVACY_CONTACT",
  "TENCENT_SMS_SECRET_ID",
  "TENCENT_SMS_SECRET_KEY",
  "TENCENT_SMS_APP_ID",
  "TENCENT_SMS_SIGN_NAME",
  "TENCENT_SMS_TEMPLATE_ID",
  "SUPABASE_SEND_SMS_HOOK_SECRET",
  "TENCENT_SMS_REGION",
  "TENCENT_SMS_TEMPLATE_PARAM_KEYS",
  "TENCENT_SMS_OTP_TTL_MINUTES",
  "CRON_SECRET",
  "CHANNEL_MESSAGE_ENCRYPTION_KEY",
  "KIMI_API_KEY",
  "KIMI_BASE_URL",
  "KIMI_MODEL",
  "KIMI_VISION_MODEL",
  "RAG_EMBEDDING_PROVIDER",
  "RAG_EMBEDDING_API_KEY",
  "RAG_EMBEDDING_BASE_URL",
  "RAG_EMBEDDING_MODEL",
  "RAG_EMBEDDING_DIMENSIONS",
  "ASR_PROVIDER",
  "NEXT_PUBLIC_DEMO_MODE",
  "NEXT_PUBLIC_DEV_LOGIN",
  "AUTH_TEST_MODE",
];

const errors = [];
for (const key of required) {
  const value = process.env[key]?.trim();
  if (!value || /^(your_|example|待配置|changeme)/i.test(value))
    errors.push(`${key}: 未配置正式值`);
}

for (const key of [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "TARO_APP_API_BASE_URL",
]) {
  const value = process.env[key]?.trim();
  if (value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:")
        errors.push(`${key}: 正式环境必须使用 HTTPS`);
      if (["localhost", "127.0.0.1", "example.invalid"].includes(url.hostname))
        errors.push(`${key}: 不能使用本地或占位域名`);
      if (key === "TARO_APP_API_BASE_URL" && (url.pathname !== "/" || url.search || url.hash))
        errors.push(`${key}: 必须只填写 API 域名，不能附带路径、查询参数或锚点`);
    } catch {
      errors.push(`${key}: 不是有效 URL`);
    }
  }
}

if (
  process.env.WECHAT_MINIPROGRAM_APP_ID &&
  !/^wx[a-zA-Z0-9]{16}$/.test(process.env.WECHAT_MINIPROGRAM_APP_ID.trim())
) {
  errors.push("WECHAT_MINIPROGRAM_APP_ID: 应为 wx 开头的 18 位 AppID");
}
if (/^wx0{16}$/i.test(process.env.WECHAT_MINIPROGRAM_APP_ID?.trim() || "")) {
  errors.push("WECHAT_MINIPROGRAM_APP_ID: 不能使用示例 AppID");
}
if (process.env.CRON_SECRET && process.env.CRON_SECRET.trim().length < 32)
  errors.push("CRON_SECRET: 至少 32 个字符");
if (
  process.env.SUPABASE_SEND_SMS_HOOK_SECRET &&
  !/^(?:v1,)?whsec_[A-Za-z0-9_+/=-]{20,}$/.test(
    process.env.SUPABASE_SEND_SMS_HOOK_SECRET.trim(),
  )
) {
  errors.push("SUPABASE_SEND_SMS_HOOK_SECRET: 不是有效的 Standard Webhooks 密钥");
}
if (process.env.TENCENT_SMS_TEMPLATE_PARAM_KEYS) {
  const keys = process.env.TENCENT_SMS_TEMPLATE_PARAM_KEYS.split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (!keys.length || keys.some((key) => !["otp", "ttlMinutes"].includes(key))) {
    errors.push("TENCENT_SMS_TEMPLATE_PARAM_KEYS: 仅允许 otp、ttlMinutes");
  }
}
if (process.env.TENCENT_SMS_OTP_TTL_MINUTES) {
  const ttl = Number(process.env.TENCENT_SMS_OTP_TTL_MINUTES);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 30) {
    errors.push("TENCENT_SMS_OTP_TTL_MINUTES: 必须是 1 到 30 的整数");
  }
}
if (
  process.env.CHANNEL_MESSAGE_ENCRYPTION_KEY &&
  !/^(?:[0-9a-fA-F]{64}|[A-Za-z0-9+/]{43}=?)$/.test(
    process.env.CHANNEL_MESSAGE_ENCRYPTION_KEY.trim(),
  )
) {
  errors.push(
    "CHANNEL_MESSAGE_ENCRYPTION_KEY: 应为 32 字节十六进制或 Base64 密钥",
  );
}
function validateSubscriptionFieldMap(key) {
  if (!process.env[key]) return;
  try {
    const map = JSON.parse(process.env[key]);
    for (const field of ["title", "status", "updatedAt", "note"]) {
      if (!/^(thing|phrase|time|date|character_string)\d+$/.test(map[field] ?? "")) {
        errors.push(`${key}: ${field} 字段映射无效`);
      }
    }
  } catch {
    errors.push(`${key}: 不是有效 JSON`);
  }
}
validateSubscriptionFieldMap("WECHAT_SUBSCRIBE_SERVICE_FIELD_MAP");
if (process.env.WECHAT_SUBSCRIBE_FOLLOWUP_TEMPLATE_ID?.trim()) {
  if (!process.env.WECHAT_SUBSCRIBE_FOLLOWUP_FIELD_MAP?.trim())
    errors.push("WECHAT_SUBSCRIBE_FOLLOWUP_FIELD_MAP: 配置随访模板时必须提供字段映射");
  validateSubscriptionFieldMap("WECHAT_SUBSCRIBE_FOLLOWUP_FIELD_MAP");
}

for (const key of [
  "NEXT_PUBLIC_DEMO_MODE",
  "NEXT_PUBLIC_DEV_LOGIN",
  "AUTH_TEST_MODE",
]) {
  if (process.env[key]?.trim() !== "false")
    errors.push(`${key}: 正式发布必须明确设置为 false`);
}
if (process.env.ASSISTANT_TRANSCRIPT_RETENTION?.trim() !== "false") {
  errors.push("ASSISTANT_TRANSCRIPT_RETENTION: 首版正式环境必须设置为 false");
}
if (
  process.env.ASR_PROVIDER?.trim() === "local_whisper_wu" &&
  !process.env.ASR_PYTHON_PATH?.trim()
) {
  errors.push(
    "ASR_PYTHON_PATH: 本地 Whisper-Wu 正式部署必须指定隔离的 Python 运行时",
  );
}
if (process.env.ASR_PROVIDER?.trim() === "tencent_asr") {
  if (!(process.env.TENCENT_ASR_SECRET_ID || process.env.TENCENT_SMS_SECRET_ID)?.trim()) {
    errors.push("TENCENT_ASR_SECRET_ID: 腾讯云语音识别必须配置独立密钥，或显式复用短信 SecretID");
  }
  if (!(process.env.TENCENT_ASR_SECRET_KEY || process.env.TENCENT_SMS_SECRET_KEY)?.trim()) {
    errors.push("TENCENT_ASR_SECRET_KEY: 腾讯云语音识别必须配置独立密钥，或显式复用短信 SecretKey");
  }
  const engine = process.env.TENCENT_ASR_ENGINE?.trim() || "16k_zh_medical";
  if (!["16k_zh", "16k_zh_medical", "16k_zh_dialect"].includes(engine)) {
    errors.push("TENCENT_ASR_ENGINE: 居民端仅允许普通话、中文医疗或多方言引擎");
  }
}
if (!["local_whisper_wu", "tencent_asr"].includes(process.env.ASR_PROVIDER?.trim() || "")) {
  errors.push("ASR_PROVIDER: 仅支持 local_whisper_wu 或 tencent_asr");
}

if (process.env.RAG_EMBEDDING_PROVIDER?.trim() !== "openai-compatible") {
  errors.push("RAG_EMBEDDING_PROVIDER: 正式环境必须使用已审核的 openai-compatible Embedding 服务");
}
if (process.env.RAG_EMBEDDING_DIMENSIONS?.trim() !== "1024") {
  errors.push("RAG_EMBEDDING_DIMENSIONS: 当前 pgvector 索引必须明确设置为 1024");
}
if (process.env.RAG_EMBEDDING_BASE_URL) {
  try {
    const url = new URL(process.env.RAG_EMBEDDING_BASE_URL.trim());
    if (url.protocol !== "https:") errors.push("RAG_EMBEDDING_BASE_URL: 正式环境必须使用 HTTPS");
  } catch {
    errors.push("RAG_EMBEDDING_BASE_URL: 不是有效 URL");
  }
}

if (errors.length) {
  console.error("\n家医 Claw 正式发布检查失败：\n");
  for (const error of errors) console.error(`- ${error}`);
  console.error(
    "\n请填写 .env.production.local 后重新执行 npm run check:release。\n",
  );
  process.exit(1);
}
console.log(
  "Release environment verified: HTTPS, WeChat, SMS, RAG, operator, encryption and production flags are configured.",
);

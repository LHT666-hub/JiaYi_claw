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
  "CRON_SECRET",
  "CHANNEL_MESSAGE_ENCRYPTION_KEY",
  "KIMI_API_KEY",
  "KIMI_BASE_URL",
  "KIMI_MODEL",
  "KIMI_VISION_MODEL",
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
if (process.env.CRON_SECRET && process.env.CRON_SECRET.trim().length < 32)
  errors.push("CRON_SECRET: 至少 32 个字符");
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
if (process.env.WECHAT_SUBSCRIBE_SERVICE_FIELD_MAP) {
  try {
    const map = JSON.parse(process.env.WECHAT_SUBSCRIBE_SERVICE_FIELD_MAP);
    for (const key of ["title", "status", "updatedAt", "note"]) {
      if (!/^(thing|phrase|time|date|character_string)\d+$/.test(map[key] ?? "")) {
        errors.push(`WECHAT_SUBSCRIBE_SERVICE_FIELD_MAP: ${key} 字段映射无效`);
      }
    }
  } catch {
    errors.push("WECHAT_SUBSCRIBE_SERVICE_FIELD_MAP: 不是有效 JSON");
  }
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

if (errors.length) {
  console.error("\n家医 Claw 正式发布检查失败：\n");
  for (const error of errors) console.error(`- ${error}`);
  console.error(
    "\n请填写 .env.production.local 后重新执行 npm run check:release。\n",
  );
  process.exit(1);
}
console.log(
  "Release environment verified: HTTPS, WeChat, SMS, operator, encryption and production flags are configured.",
);

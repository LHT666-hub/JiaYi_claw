# 腾讯云短信与 Supabase OTP 接入

居民和工作人员都通过 Supabase Auth 生成一次性验证码。正式环境由 Supabase Send SMS Hook 调用家医 Claw，再由服务端使用腾讯云 TC3-HMAC-SHA256 签名发送短信。浏览器和小程序不会接触腾讯云密钥或验证码模板配置。

## 1. 腾讯云准备

1. 在腾讯云短信控制台创建应用并取得 `SmsSdkAppId`。
2. 审核短信签名和验证码模板，记录签名名称与模板 ID。
3. 模板变量顺序必须与 `TENCENT_SMS_TEMPLATE_PARAM_KEYS` 一致。默认只传验证码：`otp`；若模板还包含有效分钟数，则设为 `otp,ttlMinutes`。
4. 创建只允许调用短信 `SendSms` 的最小权限密钥，不复用管理员密钥。

## 2. Supabase Hook

1. 在 Supabase Dashboard 打开 **Authentication > Hooks > Send SMS Hook**。
2. 选择 HTTP Hook，URL 填写：

   `https://lht11.me/api/v1/hooks/supabase/send-sms`

3. 生成 Standard Webhooks secret。将完整的 `v1,whsec_...` 值保存到部署平台的 `SUPABASE_SEND_SMS_HOOK_SECRET`。
4. 保存后用限定测试手机号发送一次验证码。Hook 必须在 5 秒内返回空的 HTTP 200。

## 3. 正式环境变量

```text
SUPABASE_SEND_SMS_HOOK_SECRET=v1,whsec_...
TENCENT_SMS_SECRET_ID=...
TENCENT_SMS_SECRET_KEY=...
TENCENT_SMS_APP_ID=...
TENCENT_SMS_SIGN_NAME=...
TENCENT_SMS_TEMPLATE_ID=...
TENCENT_SMS_REGION=ap-guangzhou
TENCENT_SMS_TEMPLATE_PARAM_KEYS=otp
TENCENT_SMS_OTP_TTL_MINUTES=5
```

临时安全令牌场景可额外配置 `TENCENT_SMS_SECURITY_TOKEN`。所有值只放在服务端环境变量，不提交 Git，不粘贴到聊天或截图中。

## 4. 验收

- `GET /api/v1/auth/capabilities` 返回 `sms.available=true`。
- 居民与工作人员登录页显示可用的验证码输入，不显示“通道暂未开放”。
- 正确号码能收到正式签名短信，错误验证码不能建立会话。
- Hook 拒绝无签名、过期签名、非中国大陆手机号和异常 OTP。
- 服务日志只包含 `traceId` 与稳定错误码，不包含手机号、验证码或腾讯云密钥。

执行 `npm run check:release` 后，短信 Hook 密钥、模板参数和有效期也会进入正式发布门禁。

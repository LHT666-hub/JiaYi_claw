# 家医 Claw

家医 Claw 是面向居民、家属和社区家庭医生团队的基层健康服务协同平台。它提供公开信息、家医预约、分级转诊协助、服务进度、居民资料整理、工作人员工作队列和企业微信渠道，不提供自动诊断、处方、停换药或剂量调整。

项目同时交付：

- Taro + React 微信小程序作为居民/家属主产品。
- Next.js Web 作为医生、工作人员和管理员主工作台，并保留居民 H5 兼容入口。
- 可审计的 Skill Registry、预约状态机、通知 outbox、内容/排班审核和家属授权。

## 正式产品结构

居民与家属端一级导航固定为：首页、服务、消息、我的。

- 首页：Claw 对话、今日提醒、服务进度、所属家医网络和核验排班。
- 服务：快捷办理、社区首诊/上转网络、坐班信息、活动和家医课堂。
- 消息：预约/转诊状态、补充资料请求、随访和企业微信绑定状态。
- 我的：健康记录、家属授权、通知偏好、隐私授权和账号注销。

工作人员与管理员使用独立桌面工作台，处理服务请求、居民摘要、群事实候选、内容来源、排班核验、广播和 Skill 运行情况。

## 核心安全边界

- 居民和家属可公开注册；工作人员只能通过机构邀请获得角色。
- 服务请求的每次状态变化都有操作者、事件和幂等键。
- AI 不直接写数据库；写操作必须经过用户确认和服务端权限校验。
- 群聊中的居民信息先成为候选事实，经家医确认后才入档。
- 排班和内容必须有来源、审核人及有效期；无正式号源时不虚构。
- 医疗健康信息、AI、家属代办和通知分别记录授权，可撤回。
- 注销提供 7 天冷静期；到期删除健康资料并匿名化必要审计记录。
- 生产模式禁用体验账号、localStorage 业务回退及旧 Demo API。
- 未登录访客可查询已审核公开信息并打开经服务端复核的原文；预约、健康资料和服务链接仍要求登录。

## 本地运行

```powershell
npm install
& "$env:LOCALAPPDATA\CodexTools\supabase-2.109.1\supabase.exe" start
npm run bootstrap:local
npm run dev:web -- -p 3000 -H 0.0.0.0
```

电脑访问 `http://127.0.0.1:3000/login`；同一局域网手机访问电脑 IPv4 地址的 `3000` 端口。本地登录页会直接显示居民、家属、医生和管理员展示入口；每次执行本地数据库重置后，需要重新运行 `npm run bootstrap:local` 初始化这些测试账号。

本地固定 OTP 仅用于 localhost Supabase。生产必须关闭 `AUTH_TEST_MODE`，并通过 Supabase Send SMS Hook 接入腾讯云短信。
短信签名、Hook URL、模板变量与验收步骤见 [腾讯云短信与 Supabase OTP 接入](docs/SMS_AUTH_HOOK.md)。

## 验证命令

```powershell
npm run check:all
npm run verify:onboarding
npm run verify:operations
npm run verify:assistant-continuity
npm run verify:rls
npm run verify:release-compliance
npm run verify:wechat-notifications
npm run eval:ask
npm run test:e2e
npm run build:all
```

- `check:all`：Web/小程序类型、Lint、单测和第三方许可证。
- `verify:onboarding`：角色提权、首次建档、家属一次性授权和同意记录。
- `verify:operations`：以生产构建验证内容到期下架、访客公开资料与原文防篡改、cron 鉴权、通知幂等和第 5 次失败进入死信。
- `verify:assistant-continuity`：验证居民/家属会话隔离、未授权拒绝、无原文存储和清除级联。
- `verify:rls`：58 条真实 JWT 断言，覆盖跨居民、可撤销家属授权、健康记录代录与数值约束、跨社区、跨机构、临床写入、经办认领和旧表隐私边界。
- `verify:release-compliance`：通知偏好、注销冷静期、撤销、到期匿名化和健康数据删除。
- `verify:wechat-notifications`：订阅授权、通知偏好和审计原子写入，以及并发授权领取。
- `eval:ask`：通过真实 HTTP 接口回归公开信息边界、急症、调药、提示注入和方言表达。
- `test:e2e`：居民、家属、工作人员、内容审核、语音、隐私和移动端视觉闭环。
- `build:all`：Next.js 与微信小程序生产编译。
- `verify:wechat-package`：检查小程序页面产物、包体、录音隐私声明、搜索屏蔽和开发入口泄漏。

## 正式发布

复制 `.env.production.example` 为不提交 Git 的 `.env.production.local`，填写正式资质后执行：

```powershell
npm run check:release
npm run build:release
```

发布门禁会拒绝以下情况：测试/演示模式、HTTP 或本地域名、`touristappid`、缺少短信/微信/AI/语音配置、无运营主体和隐私联系人、弱 cron 或消息加密密钥。

完整外部资质、部署与微信审核步骤见 [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)。
真机逐项验收与证据要求见 [docs/WECHAT_DEVICE_ACCEPTANCE.md](docs/WECHAT_DEVICE_ACCEPTANCE.md)。

## 语音识别

Web 使用 `MediaRecorder`，小程序使用原生 `RecorderManager`，统一上传到 `POST /api/v1/speech/transcribe`。音频最大 10MB，写入临时目录，识别后删除；转写文字必须由居民确认后才能进入 Claw。

当前本地 Worker 为 Whisper Small + Whisper-Wu LoRA。模型链路已实测可运行，但公开上海话样本准确率尚未达到试点验收标准。正式部署必须提供隔离的 Python 运行时，并建立真实普通话/上海话语料评测，不把“模型能启动”等同于“识别质量合格”。

## 报告与药盒识别

Web 与小程序统一上传到 `POST /api/v1/documents/analyze`。接口仅接受 JPEG、PNG、WebP，最大 4 MB，并同时校验文件声明与文件魔数。图片只在当前请求内发送给配置的 Kimi 视觉模型，不写磁盘、对象存储、数据库或日志；数据库仅记录图片字节数、媒体类型、文档类型、置信度和 `retained=false`。

识别结果分为可见文字、通俗摘要、需要向医生确认的问题和不确定项。居民必须核对后才能把文字带入 Claw，系统不会依据图片诊断、开方或调整用药。部署与验证细节见 [报告与药盒图片处理说明](docs/DOCUMENT_VISION.md)。

## 第三方来源

产品和开源项目的借鉴边界见 [产品与开源借鉴台账](docs/PRODUCT_BENCHMARKS.md)。

固定版本、许可证和用途记录在 `third_party/skills/registry.json` 与 `THIRD_PARTY_NOTICES.md`。无清晰许可证的项目只借鉴产品思路，不复制代码或提示词。

# 家医 Claw 微信上架清单

这份清单区分“代码可以完成”和“必须由运营主体/试点机构提供”的工作。只有所有阻断项关闭后，才能把体验版提交微信审核。

## 1. 运营主体与产品资质

- [ ] 确认小程序运营主体全称、统一社会信用代码、联系人和隐私负责人。
- [ ] 以该主体完成微信小程序注册、认证并取得正式 AppID/Secret。
- [ ] 根据实际功能申请医疗健康/生活服务等合适类目；不以 AI 名义申报互联网诊疗能力。
- [ ] 与首个社区卫生服务机构签署试点、数据处理和人员账号管理约定。
- [ ] 确认客服电话、服务时间、投诉处理和数据主体权利响应流程。

## 2. 域名与境内部署

- [ ] 准备已备案的境内 HTTPS 域名，证书链和 TLS 配置通过检查。
- [ ] 在微信后台配置 request/uploadFile/downloadFile 合法域名。
- [ ] 部署境内数据库、备份、密钥管理、日志脱敏和最小权限网络。
- [ ] 生产环境不写入当前境外演示 Supabase，不使用真实居民数据做测试。
- [ ] 配置 `/api/v1/health/live` 与 `/api/v1/health/ready` 监控和告警。

## 3. 登录与消息渠道

- [ ] 在服务端配置 `WECHAT_MINIPROGRAM_APP_ID` 与 `WECHAT_MINIPROGRAM_APP_SECRET`。
- [ ] 腾讯云创建短信应用、签名和 OTP 模板，配置 Supabase Send SMS Hook。
- [ ] 按 [SMS_AUTH_HOOK.md](SMS_AUTH_HOOK.md) 验证 Hook 签名、模板变量顺序、5 秒超时和日志脱敏。
- [ ] 验证手机号一键登录、短信备用登录、token 刷新和多设备退出。
- [ ] 如启用企业微信，申请官方企业应用、客户联系/会话能力并配置回调域名。
- [ ] 不使用个人微信挂机、模拟点击或非官方群消息自动化。

## 4. 机构、排班与内容

- [ ] 在管理后台录入真实社区、家医团队和经确认的协作医院。
- [ ] 每位医生、科室和排班记录有负责人、来源、有效时间和核验人。
- [ ] 官方挂号入口使用机构确认的 HTTPS 页面，不展示推测号源。
- [ ] 公众号/官网内容只导入标题、封面、必要摘要和原文链接，全部人工审核。
- [ ] 内容运营准备首批活动、服务说明、家医课堂和过期下架规则。

## 5. 隐私与账号生命周期

- [ ] 将运营主体和隐私联系方式写入 `.env.production.local`，核对公开协议全文。
- [ ] 在微信后台填写《小程序用户隐私保护指引》，声明手机号、录音、相机/相册图片和健康信息用途，并列明 Moonshot/Kimi 为受托 AI 处理方。
- [ ] 真机验证敏感授权、家属代办、AI 处理和通知授权可单独撤回。
- [ ] 配置每日账号注销 worker，调用 `/api/v1/internal/account-deletions/process`。
- [ ] 配置 outbox、广播和过期数据清理任务；失败进入告警和人工工作台。
- [ ] 建立数据泄露、误发消息、错误排班和账号冒用应急流程。

## 6. 正式环境变量

从仓库根目录的 `.env.production.example` 创建 `.env.production.local`，并按 [WECHAT_RELEASE_RUNBOOK.md](WECHAT_RELEASE_RUNBOOK.md) 操作，至少包括：

- 正式 App/API/Supabase HTTPS 地址和密钥。
- 微信 AppID/Secret、腾讯云短信配置。
- 运营主体、隐私联系人、Kimi 文本模型与 `KIMI_VISION_MODEL` 配置。
- ASR provider 与隔离 Python 路径。
- 32 字节群消息加密密钥和高强度 cron secret。
- `NEXT_PUBLIC_DEMO_MODE=false`、`NEXT_PUBLIC_DEV_LOGIN=false`、`AUTH_TEST_MODE=false`。

执行 `npm run check:release`，必须为绿色；不得通过修改校验脚本绕过缺项。

## 7. 发布前验证

```powershell
npm run check:all
npm run verify:onboarding
npm run verify:operations
npm run verify:rls
npm run verify:release-compliance
npm run verify:wechat-notifications
npm run verify:wechat-package
npm run test:e2e
npm run build:release
```

- [ ] 用微信开发者工具导入 `apps/wechat`，确认正式 AppID 和 `urlCheck=true`。
- [ ] 微信后台的 request/uploadFile/downloadFile 合法域名均包含 `https://lht11.me`。
- [ ] 首次调用手机号、录音或图片能力时出现全局隐私弹窗；拒绝后仍可查询公开信息。
- [ ] 使用至少一台 iPhone 和一台 Android 真机测试 375/390/430 宽度及系统大字体。
- [ ] 完成居民、家属、工作人员、内容审核、预约/转诊和注销六条正式环境闭环。
- [x] 完成 110 条中文 Agent 安全评测和 30 条真实 HTTP 回归，高风险漏拦截为 0。
- [x] 从空数据库执行全部迁移，并通过 70 条跨居民、家属授权撤销、社区、机构、居民反馈、临床写入和经办认领 RLS 断言。
- [x] 验证过期内容下架、cron 鉴权、通知幂等和第 5 次失败进入死信。
- [ ] 真实普通话和上海话语音集分别统计字错率；不达门槛时默认提供文字输入。
- [ ] 使用脱敏的真实报告、处方和药盒图片验证文字准确率、不确定项提示、4 MB 限制、图片不落盘及居民确认后再进入 Claw。
- [ ] 确认无 Demo 字样、体验账号、静态医生/号源或 localStorage 业务数据。
- [ ] 按 `docs/WECHAT_DEVICE_ACCEPTANCE.md` 完成逐项真机验收并归档证据。

## 8. 微信提交材料

- [ ] 小程序名称、简介、服务类目、图标和不少于 4 张真实功能截图。
- [ ] 测试账号/测试手机号、审核路径和人工协同说明。
- [ ] 隐私政策、用户协议、账号注销路径和客服联系方式。
- [ ] 微信原生客服已配置接待人员；居民反馈从提交、机构处理到结果通知完成真机验收。
- [ ] 说明“平台不提供诊断、处方或调药，预约采用人工协同，不承诺实时号源”。
- [ ] 提交体验版，完成内部验收后再提交微信审核；审核意见逐条留档。

## 9. 上线后

- [ ] 监控登录成功率、预约提交成功率、首次响应时间、消息失败和 AI 人工接管率。
- [ ] 每周核验排班和内容来源，每月复盘越权测试与 Skill 评测。
- [ ] 重大版本灰度发布，保留数据库备份和可验证的回滚步骤。
- [ ] 上线后再申请医院/HIS/健康云正式接口；通过 `AppointmentProvider` 替换人工协同，不改变居民流程。

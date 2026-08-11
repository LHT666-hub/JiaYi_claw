export const CURRENT_POLICY_VERSION = "2026-08-11";

export const CONSENT_COPY = {
  privacy: {
    title: "隐私政策与账号服务",
    description: "用于创建账号、提供家医服务并保护账号安全。此项为使用平台所必需。",
    required: true,
  },
  sensitive_health: {
    title: "敏感健康信息处理",
    description: "允许处理您主动提交的症状、指标、药品和报告资料；图片仅在识别期间临时处理，除非您另行确认，否则不写入档案。",
    required: false,
  },
  ai_processing: {
    title: "AI 辅助整理",
    description: "允许 Claw 使用受托 AI 服务提取文字、服务意图并整理给家医团队，不用于自动诊断、开方或调药。",
    required: false,
  },
  notification: {
    title: "服务通知",
    description: "接收预约进度、补充资料、排班活动和随访提醒。微信订阅消息按模板逐次授权，可随时关闭其他通知渠道。",
    required: false,
  },
} as const;

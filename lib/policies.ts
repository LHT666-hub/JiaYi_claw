export const CURRENT_POLICY_VERSION = "2026-07-18";

export const CONSENT_COPY = {
  privacy: {
    title: "隐私政策与账号服务",
    description: "用于创建账号、提供家医服务并保护账号安全。此项为使用平台所必需。",
    required: true,
  },
  sensitive_health: {
    title: "敏感健康信息处理",
    description: "允许保存您主动提交的症状、指标、药品和报告资料，用于服务协同。",
    required: false,
  },
  ai_processing: {
    title: "AI 辅助整理",
    description: "允许 Claw 提取服务意图并整理给家医团队，不用于自动诊断、开方或调药。",
    required: false,
  },
  notification: {
    title: "服务通知",
    description: "接收预约进度、补充资料、排班活动和随访提醒，可随时关闭。",
    required: false,
  },
} as const;

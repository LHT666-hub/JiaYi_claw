import {
  isSupabaseConfigured,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/env";
import {
  isTencentSmsConfigured,
  isWechatLoginConfigured,
} from "@/lib/auth/capabilities";

export type ReadinessStatus = "ready" | "pending" | "blocked";

export type ReadinessCheck = {
  id: string;
  label: string;
  detail: string;
  status: ReadinessStatus;
  action: string | null;
};

function hasAll(...values: Array<string | undefined>) {
  return values.every((value) => Boolean(value?.trim()));
}

function configured(
  id: string,
  label: string,
  ready: boolean,
  readyDetail: string,
  action: string,
  blocked = true,
): ReadinessCheck {
  return {
    id,
    label,
    detail: ready ? readyDetail : "正式配置尚未完成。",
    status: ready ? "ready" : blocked ? "blocked" : "pending",
    action: ready ? null : action,
  };
}

export function getEnvironmentReadiness(): ReadinessCheck[] {
  const asrProvider = process.env.ASR_PROVIDER?.trim();
  const asrReady = Boolean(
    asrProvider &&
      (asrProvider !== "local_whisper_wu" || process.env.ASR_PYTHON_PATH?.trim()),
  );

  return [
    configured(
      "supabase-public",
      "账号与数据库入口",
      isSupabaseConfigured(),
      "公开 Supabase 地址和匿名密钥已配置。",
      "配置正式 Supabase URL 与 anon key。",
    ),
    configured(
      "supabase-service",
      "服务端数据库权限",
      isSupabaseServiceRoleConfigured(),
      "服务端密钥已配置，可执行通知、微信登录和运维任务。",
      "在部署平台配置 SUPABASE_SERVICE_ROLE_KEY。",
    ),
    configured(
      "sms",
      "短信验证码",
      isTencentSmsConfigured(),
      "Supabase Send SMS Hook 与腾讯云短信参数已配置。",
      "按短信接入文档配置 Hook、签名、模板和最小权限密钥。",
    ),
    configured(
      "wechat-login",
      "微信一键登录",
      isWechatLoginConfigured(),
      "小程序 AppID、Secret 与服务端账号能力已配置。",
      "配置正式小程序 AppID/Secret 与服务端数据库密钥。",
    ),
    configured(
      "wechat-notification",
      "微信订阅通知",
      hasAll(
        process.env.WECHAT_SUBSCRIBE_SERVICE_TEMPLATE_ID,
        process.env.WECHAT_SUBSCRIBE_SERVICE_FIELD_MAP,
      ),
      "服务状态订阅模板和字段映射已配置。",
      "在微信公众平台申请服务状态模板并配置字段映射。",
      false,
    ),
    configured(
      "assistant",
      "Claw 文本助手",
      hasAll(process.env.KIMI_API_KEY, process.env.KIMI_BASE_URL, process.env.KIMI_MODEL),
      "文本模型连接参数已配置。",
      "配置 Kimi API 密钥、地址和文本模型。",
    ),
    configured(
      "vision",
      "报告与药盒识别",
      hasAll(process.env.KIMI_API_KEY, process.env.KIMI_VISION_MODEL),
      "视觉模型已配置，图片仍按不落盘策略处理。",
      "配置 KIMI_VISION_MODEL 并完成脱敏图片验收。",
      false,
    ),
    configured(
      "speech",
      "语音识别",
      asrReady,
      "语音识别 provider 与隔离运行时已配置。",
      "配置 ASR provider；本地 Whisper-Wu 需提供隔离 Python 路径。",
      false,
    ),
    configured(
      "operations",
      "运营主体与隐私联系",
      hasAll(process.env.NEXT_PUBLIC_OPERATOR_NAME, process.env.NEXT_PUBLIC_PRIVACY_CONTACT),
      "运营主体和隐私联系方式已配置。",
      "填写正式运营主体全称与居民可联系的隐私负责人。",
    ),
    configured(
      "workers",
      "定时任务与消息保护",
      hasAll(process.env.CRON_SECRET, process.env.CHANNEL_MESSAGE_ENCRYPTION_KEY),
      "通知 worker 密钥和群消息加密密钥已配置。",
      "配置高强度 cron secret 与 32 字节消息加密密钥。",
    ),
  ];
}

export function summarizeReadiness(checks: ReadinessCheck[]) {
  return {
    ready: checks.filter((check) => check.status === "ready").length,
    pending: checks.filter((check) => check.status === "pending").length,
    blocked: checks.filter((check) => check.status === "blocked").length,
    total: checks.length,
  };
}

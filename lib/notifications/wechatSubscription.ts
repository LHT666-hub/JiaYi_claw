import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const fieldMapSchema = z.record(
  z.enum(["title", "status", "updatedAt", "note"]),
  z.string().regex(/^(thing|phrase|time|date|character_string)\d+$/),
);

export type WechatSubscriptionTemplate = {
  key: "service_update" | "followup_reminder";
  id: string;
  label: string;
  fieldMap: Record<string, string>;
};

export type WechatDeliveryResult = {
  status: "sent" | "skipped";
  reason?: string;
  templateKey?: string;
};

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function readTemplate(
  key: WechatSubscriptionTemplate["key"],
  label: string,
  idKey: string,
  mapKey: string,
) {
  const id = process.env[idKey]?.trim();
  const rawMap = process.env[mapKey]?.trim();
  if (!id || !rawMap) return null;
  try {
    const fieldMap = fieldMapSchema.parse(JSON.parse(rawMap));
    return { key, id, label, fieldMap } satisfies WechatSubscriptionTemplate;
  } catch {
    return null;
  }
}

export function getWechatSubscriptionTemplates() {
  return [
    readTemplate(
      "service_update",
      "预约与服务进度",
      "WECHAT_SUBSCRIBE_SERVICE_TEMPLATE_ID",
      "WECHAT_SUBSCRIBE_SERVICE_FIELD_MAP",
    ),
    readTemplate(
      "followup_reminder",
      "随访与复查提醒",
      "WECHAT_SUBSCRIBE_FOLLOWUP_TEMPLATE_ID",
      "WECHAT_SUBSCRIBE_FOLLOWUP_FIELD_MAP",
    ),
  ].filter((item): item is WechatSubscriptionTemplate => Boolean(item));
}

export function indexLatestSubscriptionGrant<T extends { template_id: string }>(
  newestFirst: T[],
) {
  const latest: Record<string, T> = {};
  for (const item of newestFirst) {
    if (!latest[item.template_id]) latest[item.template_id] = item;
  }
  return latest;
}

function truncate(value: string, field: string) {
  if (field.startsWith("phrase")) return value.slice(0, 5);
  if (field.startsWith("thing")) return value.slice(0, 20);
  if (field.startsWith("character_string")) return value.slice(0, 32);
  return value;
}

export function buildWechatSubscriptionData(
  fieldMap: Record<string, string>,
  values: Record<"title" | "status" | "updatedAt" | "note", string>,
) {
  return Object.fromEntries(
    Object.entries(fieldMap).map(([source, target]) => [
      target,
      { value: truncate(values[source as keyof typeof values] ?? "", target) },
    ]),
  );
}

async function getWechatAccessToken(forceRefresh = false) {
  if (
    !forceRefresh &&
    cachedAccessToken &&
    cachedAccessToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedAccessToken.value;
  }
  const appId = process.env.WECHAT_MINIPROGRAM_APP_ID?.trim();
  const appSecret = process.env.WECHAT_MINIPROGRAM_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new Error("WECHAT_DELIVERY_NOT_CONFIGURED");
  const response = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`,
    { cache: "no-store" },
  );
  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
  };
  if (!response.ok || !payload.access_token)
    throw new Error(`WECHAT_TOKEN_FAILED:${payload.errcode ?? response.status}`);
  cachedAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(300, payload.expires_in ?? 7200) * 1000,
  };
  return payload.access_token;
}

async function sendWechatMessage(
  openId: string,
  template: WechatSubscriptionTemplate,
  page: string,
  data: Record<string, { value: string }>,
  retry = true,
) {
  const accessToken = await getWechatAccessToken(!retry);
  const response = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        touser: openId,
        template_id: template.id,
        page,
        miniprogram_state:
          process.env.WECHAT_MINIPROGRAM_STATE?.trim() || "formal",
        lang: "zh_CN",
        data,
      }),
      cache: "no-store",
    },
  );
  const payload = (await response.json()) as {
    errcode?: number;
    errmsg?: string;
  };
  if (response.ok && (!payload.errcode || payload.errcode === 0)) return;
  if (retry && [40001, 40014, 42001].includes(payload.errcode ?? 0)) {
    cachedAccessToken = null;
    return sendWechatMessage(openId, template, page, data, false);
  }
  const error = new Error(
    `WECHAT_SUBSCRIBE_SEND_FAILED:${payload.errcode ?? response.status}:${payload.errmsg ?? "unknown"}`,
  );
  Object.assign(error, { wechatCode: payload.errcode });
  throw error;
}

export async function deliverWechatServiceUpdate(input: {
  supabase: SupabaseClient;
  recipientId: string;
  requestId: string;
  title: string;
  status: string;
  note: string;
  updatedAt: string;
}): Promise<WechatDeliveryResult> {
  const template = getWechatSubscriptionTemplates().find(
    (item) => item.key === "service_update",
  );
  if (!template)
    return { status: "skipped", reason: "template_not_configured" };

  const { data: preferences } = await input.supabase
    .from("notification_preferences")
    .select("wechat_mini_enabled")
    .eq("user_id", input.recipientId)
    .maybeSingle();
  if (!preferences?.wechat_mini_enabled)
    return { status: "skipped", reason: "user_disabled" };

  const appId = process.env.WECHAT_MINIPROGRAM_APP_ID?.trim();
  const { data: identity } = await input.supabase
    .from("wechat_identities")
    .select("open_id")
    .eq("user_id", input.recipientId)
    .eq("app_id", appId ?? "")
    .maybeSingle();
  if (!identity?.open_id)
    return { status: "skipped", reason: "identity_not_bound" };

  const { data: grantId, error: grantError } = await input.supabase.rpc(
    "claim_wechat_subscription_grant",
    {
      p_user_id: input.recipientId,
      p_template_id: template.id,
    },
  );
  if (grantError) throw new Error("WECHAT_GRANT_CLAIM_FAILED");
  if (!grantId)
    return { status: "skipped", reason: "subscription_not_available" };

  try {
    await sendWechatMessage(
      identity.open_id,
      template,
      `pages/progress/index?id=${encodeURIComponent(input.requestId)}`,
      buildWechatSubscriptionData(template.fieldMap, {
        title: input.title,
        status: input.status,
        updatedAt: input.updatedAt,
        note: input.note,
      }),
    );
    await input.supabase
      .from("wechat_subscription_grants")
      .update({
        delivery_status: "sent",
        last_error: null,
      })
      .eq("id", grantId);
    return { status: "sent", templateKey: template.key };
  } catch (error) {
    const code = Number((error as Error & { wechatCode?: number }).wechatCode);
    const permanentlyUnavailable = [40037, 43101].includes(code);
    await input.supabase
      .from("wechat_subscription_grants")
      .update({
        consumed_at: permanentlyUnavailable ? new Date().toISOString() : null,
        delivery_status: permanentlyUnavailable ? "invalid" : "failed",
        last_error: error instanceof Error ? error.message.slice(0, 200) : "SEND_FAILED",
      })
      .eq("id", grantId);
    if (permanentlyUnavailable)
      return { status: "skipped", reason: `wechat_${code}` };
    throw error;
  }
}

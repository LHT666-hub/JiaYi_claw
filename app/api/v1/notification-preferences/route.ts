import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const input = z.object({
  serviceUpdates: z.boolean(),
  followupReminders: z.boolean(),
  contentUpdates: z.boolean(),
  smsEnabled: z.boolean(),
  wecomEnabled: z.boolean(),
  wechatMiniEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

const defaults = {
  service_updates: true,
  followup_reminders: true,
  content_updates: false,
  sms_enabled: false,
  wecom_enabled: true,
  wechat_mini_enabled: false,
  quiet_hours_start: "21:00",
  quiet_hours_end: "08:00",
};

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !supabase) return apiOk({ demo: true, preferences: { user_id: "showcase-resident", ...defaults } }, traceId);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  const { data, error } = await supabase.from("notification_preferences").select("*").eq("user_id", profile.id).maybeSingle();
  return error
    ? apiError("PREFERENCES_READ_FAILED", "暂时无法读取通知设置。", 500, traceId)
    : apiOk({ preferences: data ?? { user_id: profile.id, ...defaults } }, traceId);
}

export async function PUT(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !supabase) return apiOk({ demo: true, simulated: true, preferences: defaults }, traceId);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_PREFERENCES", "通知设置格式不正确。", 400, traceId);
  const { data, error } = await supabase.from("notification_preferences").upsert({
    user_id: profile.id,
    service_updates: parsed.data.serviceUpdates,
    followup_reminders: parsed.data.followupReminders,
    content_updates: parsed.data.contentUpdates,
    sms_enabled: parsed.data.smsEnabled,
    wecom_enabled: parsed.data.wecomEnabled,
    ...(typeof parsed.data.wechatMiniEnabled === "boolean"
      ? { wechat_mini_enabled: parsed.data.wechatMiniEnabled }
      : {}),
    quiet_hours_start: parsed.data.quietHoursStart,
    quiet_hours_end: parsed.data.quietHoursEnd,
    updated_at: new Date().toISOString(),
  }).select("*").single();
  return error
    ? apiError("PREFERENCES_SAVE_FAILED", "通知设置保存失败。", 500, traceId)
    : apiOk({ preferences: data }, traceId);
}

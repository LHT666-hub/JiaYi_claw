import { Button, Input, Switch, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { apiRequest } from "../../lib/api";

type Preferences = { service_updates: boolean; followup_reminders: boolean; content_updates: boolean; sms_enabled: boolean; wecom_enabled: boolean; quiet_hours_start: string; quiet_hours_end: string };
const initial: Preferences = { service_updates: true, followup_reminders: true, content_updates: false, sms_enabled: false, wecom_enabled: true, quiet_hours_start: "21:00", quiet_hours_end: "08:00" };

export default function NotificationSettingsPage() {
  const [value, setValue] = useState(initial); const [saving, setSaving] = useState(false);
  useDidShow(() => { void apiRequest<{ preferences: Preferences }>("/api/v1/notification-preferences").then((result) => setValue(result.preferences)).catch((error) => Taro.showToast({ title: error.message, icon: "none" })); });
  function toggle(key: keyof Preferences, checked: boolean) { setValue((current) => ({ ...current, [key]: checked })); }
  async function save() { setSaving(true); try { const result = await apiRequest<{ preferences: Preferences }>("/api/v1/notification-preferences", { method: "PUT", data: { serviceUpdates: value.service_updates, followupReminders: value.followup_reminders, contentUpdates: value.content_updates, smsEnabled: value.sms_enabled, wecomEnabled: value.wecom_enabled, quietHoursStart: value.quiet_hours_start.slice(0, 5), quietHoursEnd: value.quiet_hours_end.slice(0, 5) } }); setValue(result.preferences); Taro.showToast({ title: "设置已保存", icon: "success" }); } catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" }); } finally { setSaving(false); } }
  return <View className="page"><View className="page-heading"><Text className="title">通知设置</Text><Text className="subtitle">服务结果优先送达，内容通知由您决定</Text></View><View className="card">{[
    ["service_updates", "预约与服务进度", "受理、补资料、确认时段与办理结果"], ["followup_reminders", "随访提醒", "家医团队发出的随访和复查提醒"], ["content_updates", "活动与家医课堂", "仅发送已审核的所属社区内容"], ["sms_enabled", "短信", "需正式短信通道配置后启用"], ["wecom_enabled", "企业微信", "绑定官方家医渠道后可用"],
  ].map(([key, title, note]) => <View key={key} className="setting-row"><View className="setting-copy"><Text className="label">{title}</Text><Text className="muted">{note}</Text></View><Switch checked={Boolean(value[key as keyof Preferences])} color="#557c6c" onChange={(event) => toggle(key as keyof Preferences, event.detail.value)} /></View>)}</View><View className="card"><Text className="label">免打扰时段</Text><View className="time-grid"><View><Text className="muted">开始</Text><Input value={value.quiet_hours_start.slice(0, 5)} onInput={(event) => setValue({ ...value, quiet_hours_start: event.detail.value })} className="input" /></View><View><Text className="muted">结束</Text><Input value={value.quiet_hours_end.slice(0, 5)} onInput={(event) => setValue({ ...value, quiet_hours_end: event.detail.value })} className="input" /></View></View><Text className="muted">紧急安全提醒不受免打扰设置影响。</Text></View><Button className="primary" loading={saving} onClick={() => void save()}>保存设置</Button></View>;
}

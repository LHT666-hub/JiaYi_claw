import { Button, Picker, Switch, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useCallback, useState } from "react";
import { apiRequest } from "../../lib/api";

type Preferences = {
  service_updates: boolean;
  followup_reminders: boolean;
  content_updates: boolean;
  sms_enabled: boolean;
  wecom_enabled: boolean;
  wechat_mini_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
};
type SubscriptionTemplate = { key: string; id: string; label: string };
const initial: Preferences = { service_updates: true, followup_reminders: true, content_updates: false, sms_enabled: false, wecom_enabled: true, wechat_mini_enabled: false, quiet_hours_start: "21:00", quiet_hours_end: "08:00" };

const preferenceRows: Array<{ key: keyof Preferences; title: string; note: string }> = [
  { key: "service_updates", title: "预约与服务进度", note: "受理、补资料、确认时段与办理结果" },
  { key: "followup_reminders", title: "随访提醒", note: "家医团队发出的随访与复查提醒" },
  { key: "content_updates", title: "活动与家医课堂", note: "只发送所属社区已经审核的内容" },
];

const channelRows: Array<{ key: keyof Preferences; title: string; note: string }> = [
  { key: "sms_enabled", title: "短信", note: "正式短信通道启用后送达" },
  { key: "wecom_enabled", title: "企业微信", note: "绑定官方家医渠道后使用" },
];

export default function NotificationSettingsPage() {
  const [value, setValue] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<SubscriptionTemplate[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [preferences, subscriptions] = await Promise.all([
        apiRequest<{ preferences: Preferences }>("/api/v1/notification-preferences"),
        apiRequest<{ configured: boolean; templates: SubscriptionTemplate[] }>("/api/v1/wechat/subscriptions"),
      ]);
      setValue(preferences.preferences);
      setBaseline(preferences.preferences);
      setTemplates(subscriptions.templates);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "通知设置暂时无法加载");
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void load();
  });

  usePullDownRefresh(() => {
    void load().finally(() => Taro.stopPullDownRefresh());
  });

  function toggle(key: keyof Preferences, checked: boolean) {
    setValue((current) => ({ ...current, [key]: checked }));
  }

  async function requestWechatSubscription(checked: boolean) {
    if (!checked) {
      setValue((current) => ({ ...current, wechat_mini_enabled: false }));
      return;
    }
    if (!templates.length) {
      Taro.showToast({ title: "机构尚未配置微信通知模板", icon: "none" });
      return;
    }
    if (process.env.TARO_ENV !== "weapp") {
      Taro.showToast({ title: "请在微信小程序内授权服务通知", icon: "none" });
      return;
    }
    setSubscribing(true);
    try {
      const response = await Taro.requestSubscribeMessage({ tmplIds: templates.map((template) => template.id) } as never) as unknown as Record<string, unknown>;
      const results = Object.fromEntries(templates.map((template) => [template.id, response[template.id]]).filter((entry): entry is [string, "accept" | "reject" | "ban"] => ["accept", "reject", "ban"].includes(String(entry[1]))));
      const recorded = await apiRequest<{ enabled: boolean }>("/api/v1/wechat/subscriptions", { method: "POST", data: { results } });
      setValue((current) => ({ ...current, wechat_mini_enabled: recorded.enabled }));
      Taro.showToast({ title: recorded.enabled ? "微信通知已授权" : "未开启微信通知", icon: recorded.enabled ? "success" : "none" });
    } catch (reason) {
      Taro.showToast({ title: reason instanceof Error ? reason.message : "订阅授权失败", icon: "none" });
    } finally {
      setSubscribing(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const result = await apiRequest<{ preferences: Preferences }>("/api/v1/notification-preferences", {
        method: "PUT",
        data: {
          serviceUpdates: value.service_updates,
          followupReminders: value.followup_reminders,
          contentUpdates: value.content_updates,
          smsEnabled: value.sms_enabled,
          wecomEnabled: value.wecom_enabled,
          wechatMiniEnabled: value.wechat_mini_enabled,
          quietHoursStart: value.quiet_hours_start.slice(0, 5),
          quietHoursEnd: value.quiet_hours_end.slice(0, 5),
        },
      });
      setValue(result.preferences);
      setBaseline(result.preferences);
      Taro.showToast({ title: "设置已保存", icon: "success" });
    } catch (reason) {
      Taro.showToast({ title: reason instanceof Error ? reason.message : "保存失败", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View className="page settings-state"><View className="loading-mark" /><Text>正在读取通知设置</Text></View>;
  if (error) return <View className="page settings-state"><Text className="settings-state-title">通知设置暂时无法加载</Text><Text className="settings-state-copy">{error}</Text><Button className="primary pressable" onClick={() => void load()}>重新加载</Button></View>;

  const dirty = JSON.stringify(value) !== JSON.stringify(baseline);
  return (
    <View className="page settings-page notification-page">
      <View className="page-heading"><Text className="eyebrow">消息送达</Text><Text className="title">通知设置</Text><Text className="subtitle">服务结果优先送达，活动与课堂内容由您决定。</Text></View>

      <View className="settings-group"><Text className="settings-group-label">服务提醒</Text>{preferenceRows.map((item) => <View key={item.key} className="setting-row"><View className="setting-copy"><Text className="settings-row-title">{item.title}</Text><Text className="settings-row-note">{item.note}</Text></View><Switch checked={Boolean(value[item.key])} color="#2f6c56" onChange={(event) => toggle(item.key, event.detail.value)} /></View>)}</View>

      <View className="settings-group"><Text className="settings-group-label">送达渠道</Text>{channelRows.map((item) => <View key={item.key} className="setting-row"><View className="setting-copy"><Text className="settings-row-title">{item.title}</Text><Text className="settings-row-note">{item.note}</Text></View><Switch checked={Boolean(value[item.key])} color="#2f6c56" onChange={(event) => toggle(item.key, event.detail.value)} /></View>)}<View className="setting-row"><View className="setting-copy"><Text className="settings-row-title">微信服务通知</Text><Text className="settings-row-note">微信会逐条询问预约或随访通知授权</Text></View><Switch disabled={subscribing} checked={value.wechat_mini_enabled} color="#2f6c56" onChange={(event) => void requestWechatSubscription(event.detail.value)} /></View></View>

      <View className="settings-group quiet-hours"><Text className="settings-group-label">免打扰时段</Text><View className="quiet-time-grid"><Picker mode="time" value={value.quiet_hours_start.slice(0, 5)} onChange={(event) => setValue((current) => ({ ...current, quiet_hours_start: String(event.detail.value) }))}><View className="quiet-time"><Text className="quiet-time-label">开始</Text><Text className="quiet-time-value">{value.quiet_hours_start.slice(0, 5)}</Text><Text className="quiet-time-action">选择</Text></View></Picker><Picker mode="time" value={value.quiet_hours_end.slice(0, 5)} onChange={(event) => setValue((current) => ({ ...current, quiet_hours_end: String(event.detail.value) }))}><View className="quiet-time"><Text className="quiet-time-label">结束</Text><Text className="quiet-time-value">{value.quiet_hours_end.slice(0, 5)}</Text><Text className="quiet-time-action">选择</Text></View></Picker></View><Text className="settings-footnote left">紧急安全提醒不受免打扰设置影响。</Text></View>

      <Button className="primary settings-save pressable" loading={saving} disabled={saving || !dirty} onClick={() => void save()}>{dirty ? "保存设置" : "设置已保存"}</Button>
    </View>
  );
}

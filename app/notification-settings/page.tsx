"use client";

import { useEffect, useState } from "react";
import { Bell, Clock3, MessageCircleMore, Smartphone } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { useToast } from "@/components/ToastProvider";

type Preferences = { service_updates: boolean; followup_reminders: boolean; content_updates: boolean; sms_enabled: boolean; wecom_enabled: boolean; wechat_mini_enabled: boolean; quiet_hours_start: string; quiet_hours_end: string };
const initial: Preferences = { service_updates: true, followup_reminders: true, content_updates: false, sms_enabled: false, wecom_enabled: true, wechat_mini_enabled: false, quiet_hours_start: "21:00", quiet_hours_end: "08:00" };

export default function NotificationSettingsPage() {
  const { showToast } = useToast();
  const [value, setValue] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => { void fetch("/api/v1/notification-preferences", { cache: "no-store" }).then(async (response) => { const payload = await response.json(); if (response.ok) setValue(payload.data.preferences); }).finally(() => setLoading(false)); }, []);
  function toggle(key: keyof Preferences) { setValue((current) => ({ ...current, [key]: !current[key] })); }
  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/v1/notification-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceUpdates: value.service_updates, followupReminders: value.followup_reminders, contentUpdates: value.content_updates, smsEnabled: value.sms_enabled, wecomEnabled: value.wecom_enabled, wechatMiniEnabled: value.wechat_mini_enabled, quietHoursStart: value.quiet_hours_start.slice(0, 5), quietHoursEnd: value.quiet_hours_end.slice(0, 5) }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "保存失败"); setValue(payload.data.preferences); showToast("通知设置已保存。", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "保存失败", "warning"); } finally { setSaving(false); }
  }
  return <PhoneShell showBottomNav><main className="space-y-5 px-4 pb-8"><BackHeader title="通知设置" subtitle="服务结果优先送达，内容通知由您决定。" />
    {loading ? <div className="py-16 text-center text-sm text-navy/45">正在读取通知设置...</div> : <>
      <section className="ios-material overflow-hidden rounded-[30px]">{[
        { key: "service_updates" as const, title: "预约与服务进度", note: "受理、补资料、确认时段与办理结果", icon: Bell },
        { key: "followup_reminders" as const, title: "随访提醒", note: "家医团队发出的随访和复查提醒", icon: Clock3 },
        { key: "content_updates" as const, title: "活动与家医课堂", note: "仅发送已审核、适用于所属社区的内容", icon: MessageCircleMore },
      ].map((item) => <div key={item.key} className="flex items-center gap-3 border-b border-line/60 p-4 last:border-0"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-health-soft text-sage"><item.icon className="h-4.5 w-4.5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-navy">{item.title}</p><p className="mt-1 text-xs leading-5 text-navy/48">{item.note}</p></div><Switch checked={value[item.key]} onClick={() => toggle(item.key)} /></div>)}</section>
      <section className="ios-material rounded-[30px] p-5"><h2 className="flex items-center gap-2 font-semibold text-navy"><Smartphone className="h-5 w-5 text-sage" />送达渠道</h2><div className="mt-4 space-y-4"><Row label="短信" note="可能产生运营短信费用" checked={value.sms_enabled} onClick={() => toggle("sms_enabled")} /><Row label="企业微信" note="绑定官方家医渠道后可用" checked={value.wecom_enabled} onClick={() => toggle("wecom_enabled")} /><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-navy">微信服务通知</p><p className="mt-1 text-xs leading-5 text-navy/45">{value.wechat_mini_enabled ? "已在微信小程序授权；每次订阅用于一条通知" : "请在微信小程序的通知设置中授权"}</p></div><span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${value.wechat_mini_enabled ? "bg-health-soft text-sage" : "bg-navy/8 text-navy/45"}`}>{value.wechat_mini_enabled ? "已授权" : "未授权"}</span></div></div></section>
      <section className="rounded-[26px] border border-line bg-surface-card p-4"><p className="text-sm font-semibold text-navy">免打扰时段</p><div className="mt-3 grid grid-cols-2 gap-3"><TimeInput label="开始" value={value.quiet_hours_start} onChange={(quiet_hours_start) => setValue({ ...value, quiet_hours_start })} /><TimeInput label="结束" value={value.quiet_hours_end} onChange={(quiet_hours_end) => setValue({ ...value, quiet_hours_end })} /></div><p className="mt-3 text-xs leading-5 text-navy/45">紧急安全提醒不受免打扰设置影响。</p></section>
      <button type="button" disabled={saving} onClick={() => void save()} className="w-full rounded-full bg-navy px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "正在保存" : "保存设置"}</button>
    </>}
  </main></PhoneShell>;
}

function Switch({ checked, onClick }: { checked: boolean; onClick: () => void }) { return <button type="button" role="switch" aria-checked={checked} onClick={onClick} className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-success" : "bg-navy/18"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`} /></button>; }
function Row({ label, note, checked, onClick }: { label: string; note: string; checked: boolean; onClick: () => void }) { return <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-navy">{label}</p><p className="mt-1 text-xs text-navy/45">{note}</p></div><Switch checked={checked} onClick={onClick} /></div>; }
function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs text-navy/50">{label}<input type="time" value={value.slice(0, 5)} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-[16px] border border-line bg-cream px-3 text-sm text-navy" /></label>; }

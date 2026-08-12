"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock3, Hash, History, MapPin, PencilLine, RefreshCw, Send, UserRound, XCircle } from "lucide-react";
import type { ServiceAction, ServiceStatus, ServiceType } from "@jiayi/contracts";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { useToast } from "@/components/ToastProvider";
import { serviceStatusLabels } from "@/lib/serviceRequests/stateMachine";

type RequestEvent = { id: string; action: ServiceAction; new_status: ServiceStatus; note: string | null; created_at: string };
type AppointmentDetails = { scheduled_at?: string | null; institution_name?: string | null; department_name?: string | null; clinician_name?: string | null; booking_reference?: string | null; arrival_instructions?: string | null };
type RequestItem = { id: string; title: string; summary: string; service_type: ServiceType; status: ServiceStatus; created_at: string; updated_at: string; appointment_details?: AppointmentDetails | AppointmentDetails[] | null; service_request_events?: RequestEvent[] | null };

const nextStep: Partial<Record<ServiceStatus, string>> = {
  submitted: "家医团队将在服务时限内受理，请留意消息。",
  needs_info: "团队需要您补充资料，提交后将重新进入办理队列。",
  accepted: "团队已受理，正在确认适合的办理方式。",
  checking_availability: "团队正在核验机构、科室或可用时段。",
  awaiting_user_confirmation: "请确认团队提出的时间，或说明希望如何改期。",
  booked: "预约已办理，请核对机构、时间和预约凭证。",
  waitlisted: "当前暂无合适资源，团队会继续跟进候补。",
  failed: "本次未能办成，可查看办理说明后重新发起服务。",
  completed: "本次服务已完成，所有步骤已留痕。",
  cancelled: "本次申请已取消。",
};

function one<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] ?? null : value ?? null; }

export default function ServiceRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { showToast } = useToast();
  const actionKeys = useRef(new Map<string, string>());
  const [item, setItem] = useState<RequestItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"none" | "reschedule" | "supplement">("none");
  const [saving, setSaving] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const response = await fetch(`/api/v1/service-requests/${id}`, { cache: "no-store" });
    if (response.status === 401) { router.replace("/login"); return; }
    const payload = await response.json();
    if (!response.ok) setError(payload.error?.message ?? "服务申请读取失败。");
    else { setItem(payload.data.request); setIsDemo(Boolean(payload.data.demo)); }
    setLoading(false);
  }, [id, router]);
  useEffect(() => { void load(); }, [load]);

  async function runAction(action: "submit" | "confirm_booking" | "request_reschedule" | "cancel") {
    if (["submit", "request_reschedule"].includes(action) && note.trim().length < 2) return showToast("请填写需要补充或调整的内容。", "warning");
    const operation = `${id}:${action}:${note.trim()}`;
    const actionKey = actionKeys.current.get(operation) ?? crypto.randomUUID();
    actionKeys.current.set(operation, actionKey);
    setSaving(true);
    const response = await fetch(`/api/v1/service-requests/${id}/actions/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": actionKey },
      body: JSON.stringify({ note: action === "cancel" ? "居民申请取消。" : action === "confirm_booking" ? "居民已确认团队提出的预约时间。" : action === "submit" ? `居民补充资料：${note.trim()}` : `居民申请改期：${note.trim()}` }),
    });
    const payload = await response.json(); setSaving(false);
    if (!response.ok) return showToast(payload.error?.message ?? "操作失败。", "warning");
    actionKeys.current.delete(operation); setNote(""); setMode("none");
    showToast(action === "submit" ? "补充资料已提交。" : action === "confirm_booking" ? "已确认预约时间。" : action === "request_reschedule" ? "改期需求已发送。" : "申请已取消。", "success");
    await load();
  }

  const details = one(item?.appointment_details);
  const events = [...(item?.service_request_events ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return <PhoneShell showBottomNav><main className="space-y-5 px-4 pb-8"><div className="relative"><BackHeader title="服务办理详情" subtitle="团队处理、居民确认和预约回执都在这里。" /><button type="button" onClick={() => void load()} aria-label="刷新服务进度" className="absolute right-0 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-sage shadow-sm"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div>
    {loading ? <div className="py-20 text-center text-sm text-navy/45">正在读取服务进度...</div> : error || !item ? <div className="ios-material rounded-[28px] p-6 text-center"><p className="text-sm font-semibold text-danger">{error || "没有找到这条服务申请。"}</p><button type="button" onClick={() => router.push("/appointments")} className="mt-4 rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white">返回预约服务</button></div> : <>
      <section className="ios-material rounded-[30px] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-sage">{serviceStatusLabels[item.status]}</p><h1 className="mt-1 text-xl font-semibold text-navy">{item.title}</h1><p className="mt-1 text-xs text-navy/40">更新于 {new Date(item.updated_at).toLocaleString("zh-CN")}</p></div><Clock3 className="h-5 w-5 text-sage" /></div><p className="mt-4 text-sm leading-7 text-navy/70">{item.summary}</p><div className="mt-4 rounded-[22px] bg-health-soft px-4 py-3"><p className="text-xs font-semibold text-sage">当前下一步</p><p className="mt-1 text-sm leading-6 text-navy/68">{nextStep[item.status] ?? "请查看最新办理记录。"}</p></div></section>
      {details?.scheduled_at || details?.booking_reference ? <section className="ios-material rounded-[28px] p-5"><h2 className="flex items-center gap-2 text-sm font-semibold text-navy"><CalendarDays className="h-4 w-4 text-sage" />预约方案与回执</h2><div className="mt-4 space-y-3 text-sm text-navy/68">{details.scheduled_at ? <p className="flex gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-sage" />{new Date(details.scheduled_at).toLocaleString("zh-CN")}</p> : null}{details.institution_name ? <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sage" />{[details.institution_name, details.department_name].filter(Boolean).join(" · ")}</p> : null}{details.clinician_name ? <p className="flex gap-2"><UserRound className="mt-0.5 h-4 w-4 shrink-0 text-sage" />{details.clinician_name}</p> : null}{details.booking_reference ? <p className="flex gap-2 rounded-[18px] bg-health-soft p-3 font-semibold text-navy"><Hash className="mt-0.5 h-4 w-4 shrink-0 text-sage" />预约编号：{details.booking_reference}</p> : null}{details.arrival_instructions ? <p className="rounded-[18px] bg-[#F4F6F5] p-3 leading-6">{details.arrival_instructions}</p> : null}</div></section> : null}
      {isDemo ? <div className="rounded-full border border-sage/20 bg-health-soft px-4 py-2 text-center text-xs font-semibold text-sage">只读展示流程 · 不会确认、改期或取消</div> : null}
      {!isDemo && item.status === "awaiting_user_confirmation" ? <section className="grid grid-cols-2 gap-2"><button type="button" disabled={saving} onClick={() => void runAction("confirm_booking")} className="flex items-center justify-center gap-2 rounded-full bg-success px-3 py-3 text-sm font-semibold text-white"><CheckCircle2 className="h-4 w-4" />确认时间</button><button type="button" onClick={() => setMode(mode === "reschedule" ? "none" : "reschedule")} className="flex items-center justify-center gap-2 rounded-full border border-sage/25 bg-white px-3 py-3 text-sm font-semibold text-sage"><PencilLine className="h-4 w-4" />申请改期</button></section> : null}
      {!isDemo && item.status === "needs_info" ? <button type="button" onClick={() => setMode(mode === "supplement" ? "none" : "supplement")} className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3.5 text-sm font-semibold text-white"><Send className="h-4 w-4" />补充团队所需资料</button> : null}
      {mode !== "none" ? <section className="ios-material rounded-[26px] p-4"><label className="text-sm font-semibold text-navy">{mode === "supplement" ? "补充资料或说明" : "希望如何调整时间"}</label><textarea autoFocus rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder={mode === "supplement" ? "请按团队要求补充症状时间、材料说明等；请勿上传无关隐私。" : "例如：下周二下午或周四上午均可"} className="mt-3 w-full resize-none rounded-[18px] border border-line bg-cream p-3 text-sm leading-6 outline-none focus:border-sage" /><button type="button" disabled={saving} onClick={() => void runAction(mode === "supplement" ? "submit" : "request_reschedule")} className="mt-3 w-full rounded-full bg-sage px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "正在提交..." : "确认提交"}</button></section> : null}
      <section className="ios-material rounded-[28px] p-5"><h2 className="flex items-center gap-2 text-sm font-semibold text-navy"><History className="h-4 w-4 text-sage" />办理记录</h2>{events.length ? <ol className="mt-4 space-y-4 border-l border-sage/25 pl-5">{events.map((event) => <li key={event.id} className="relative text-xs leading-5 text-navy/55 before:absolute before:-left-[24px] before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-sage"><div className="flex justify-between gap-3"><p className="font-semibold text-navy/75">{serviceStatusLabels[event.new_status]}</p><time className="shrink-0 text-navy/35">{new Date(event.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>{event.note ? <p className="mt-1">{event.note}</p> : null}</li>)}</ol> : <p className="mt-4 text-sm text-navy/45">暂无办理记录。</p>}</section>
      {!isDemo && !['failed','completed','cancelled'].includes(item.status) ? <button type="button" disabled={saving} onClick={() => void runAction("cancel")} className="flex w-full items-center justify-center gap-2 rounded-full border border-danger/20 bg-risk-soft px-4 py-3 text-sm font-semibold text-danger"><XCircle className="h-4 w-4" />取消本次申请</button> : null}
    </>}</main></PhoneShell>;
}

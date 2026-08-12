"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  FileText,
  RefreshCw,
  Search,
  Stethoscope,
  UserRound,
} from "lucide-react";
import type { ServiceAction, ServiceStatus } from "@jiayi/contracts";
import { useToast } from "@/components/ToastProvider";
import { serviceStatusLabels } from "@/lib/serviceRequests/stateMachine";

type Resident = { id: string; display_name: string; phone: string | null };
type AppointmentDetails = {
  target?: string;
  department?: string | null;
  preferred_doctor?: string | null;
  preferred_dates?: string[];
  preferred_time?: string | null;
  scheduled_at?: string | null;
  institution_name?: string | null;
  department_name?: string | null;
  clinician_name?: string | null;
  booking_reference?: string | null;
};
type RequestEvent = { id: string; action: string; note: string | null; new_status: string; created_at: string };
type WorkItem = {
  id: string;
  title: string;
  summary: string;
  status: ServiceStatus;
  priority: "low" | "medium" | "high" | "emergency";
  service_type: string;
  created_at: string;
  updated_at: string;
  assigned_to: string | null;
  payload?: { sourceContext?: { id?: string; title?: string; sourceName?: string; originalUrl?: string; reviewedAt?: string | null } };
  resident?: Resident | Resident[];
  assignee?: { id: string; display_name: string; role: string } | Array<{ id: string; display_name: string; role: string }> | null;
  appointment_details?: AppointmentDetails | AppointmentDetails[] | null;
  service_request_events?: RequestEvent[] | null;
};
type ClinicalBrief = {
  id: string;
  summary: string;
  structured_content: Record<string, unknown>;
  source_refs: unknown[];
  skill_id: string;
  skill_version: string;
  created_at: string;
};
type QueueFilter = "all" | "new" | "action" | "processing";

const serviceTypeLabels: Record<string, string> = {
  clinic_registration: "门诊挂号协助",
  family_doctor_booking: "家庭医生预约",
  refill_request: "续方配药申请",
  dispense_status_query: "配药进度查询",
  followup_reminder: "随访安排",
  report_explanation: "检查报告整理",
  referral_assistance: "分级转诊协助",
  other: "其他家医服务",
};

const actionOptions: Partial<Record<ServiceStatus, Array<{ action: ServiceAction; label: string; description: string }>>> = {
  submitted: [
    { action: "accept", label: "受理申请", description: "确认由当前团队开始处理" },
    { action: "request_info", label: "请求补充资料", description: "写清居民需要补充的内容" },
  ],
  accepted: [
    { action: "check_availability", label: "开始核验资源", description: "进入机构、科室或号源核验" },
    { action: "request_info", label: "请求补充资料", description: "资料不完整时退回居民补充" },
  ],
  checking_availability: [
    { action: "propose_slot", label: "提出预约方案", description: "填写时间、机构并交居民确认" },
    { action: "waitlist", label: "转入候补", description: "当前无合适资源，继续跟进" },
    { action: "fail", label: "结束本次办理", description: "说明未办理成功的原因" },
  ],
  waitlisted: [
    { action: "propose_slot", label: "提出可用方案", description: "候补已有资源，交居民确认" },
    { action: "fail", label: "结束候补", description: "说明无法继续候补的原因" },
  ],
  booked: [{ action: "complete", label: "标记服务完成", description: "确认本次服务已经结束" }],
};

const defaultNotes: Partial<Record<ServiceAction, string>> = {
  accept: "家医团队已受理本次服务申请。",
  check_availability: "团队开始核验机构、科室和可用服务资源。",
  waitlist: "当前暂时没有合适资源，已转入候补并继续跟进。",
  complete: "工作人员确认本次服务已经完成。",
};

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? null;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function WorkbenchRequestsPage() {
  const actionKeys = useRef(new Map<string, string>());
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [profile, setProfile] = useState<{ id: string; role: string; displayName: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [briefs, setBriefs] = useState<ClinicalBrief[]>([]);
  const [briefLoading, setBriefLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ServiceAction | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [institution, setInstitution] = useState("");
  const [department, setDepartment] = useState("");
  const [clinician, setClinician] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const resident = relation(selected?.resident);
  const assignee = relation(selected?.assignee);
  const appointment = relation(selected?.appointment_details);
  const sourceContext = selected?.payload?.sourceContext;
  const canAct = Boolean(selected && profile && (!selected.assigned_to || selected.assigned_to === profile.id || profile.role === "admin"));

  const counts = useMemo(() => ({
    all: items.length,
    new: items.filter((item) => item.status === "submitted").length,
    action: items.filter((item) => ["needs_info", "awaiting_user_confirmation"].includes(item.status)).length,
    processing: items.filter((item) => ["accepted", "checking_availability", "waitlisted", "booked"].includes(item.status)).length,
  }), [items]);

  const visibleItems = useMemo(() => items.filter((item) => {
    const person = relation(item.resident);
    const matchesFilter = filter === "all"
      || (filter === "new" && item.status === "submitted")
      || (filter === "action" && ["needs_info", "awaiting_user_confirmation"].includes(item.status))
      || (filter === "processing" && ["accepted", "checking_availability", "waitlisted", "booked"].includes(item.status));
    const needle = query.trim().toLowerCase();
    return matchesFilter && (!needle || [item.title, item.summary, person?.display_name, person?.phone].some((value) => String(value ?? "").toLowerCase().includes(needle)));
  }), [filter, items, query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/v1/staff/work-queue", { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 401 || response.status === 403) {
        router.replace("/staff/login");
        return;
      }
      if (!response.ok) throw new Error(payload.error?.message ?? "工作队列读取失败。");
      const next = (payload.data.requests ?? []) as WorkItem[];
      setProfile(payload.data.profile ?? null);
      setItems(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "工作队列读取失败。");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!resident?.id) {
      setBriefs([]);
      return;
    }
    const residentId = resident.id;
    setBriefLoading(true);
    void fetch(`/api/v1/residents/${residentId}/clinical-brief`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "摘要读取失败");
        setBriefs(payload.data.briefs ?? []);
      })
      .catch(() => setBriefs([]))
      .finally(() => setBriefLoading(false));
  }, [resident?.id]);

  function resetComposer(action: ServiceAction | null = null) {
    setSelectedAction(action);
    setNote(action ? defaultNotes[action] ?? "" : "");
    if (action !== "propose_slot") {
      setScheduledAt("");
      setInstitution("");
      setDepartment("");
      setClinician("");
      setReference("");
    }
  }

  function chooseItem(id: string) {
    setSelectedId(id);
    resetComposer(null);
  }

  async function submitAction() {
    if (!selected || !selectedAction) return;
    if (["request_info", "fail"].includes(selectedAction) && note.trim().length < 4) {
      showToast("请写清楚要补充的资料或结束办理的原因。", "warning");
      return;
    }
    if (selectedAction === "propose_slot" && (!scheduledAt || !institution.trim())) {
      showToast("提出预约方案前，请填写时间和机构。", "warning");
      return;
    }
    setSubmitting(true);
    const operation = `${selected.id}:${selectedAction}:${scheduledAt}:${institution}:${department}:${clinician}:${reference}:${note}`;
    const actionKey = actionKeys.current.get(operation) ?? crypto.randomUUID();
    actionKeys.current.set(operation, actionKey);
    try {
      const response = await fetch(`/api/v1/service-requests/${selected.id}/actions/${selectedAction}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": actionKey },
        body: JSON.stringify({
          note: note.trim() || null,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          institutionName: institution.trim() || null,
          departmentName: department.trim() || null,
          clinicianName: clinician.trim() || null,
          bookingReference: reference.trim() || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "状态更新失败。");
      actionKeys.current.delete(operation);
      showToast("状态、居民通知和审计记录已更新。", "success");
      resetComposer(null);
      await load();
    } catch (actionError) {
      showToast(actionError instanceof Error ? actionError.message : "状态更新失败。", "warning");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#F3F5F4] text-navy">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => router.push("/doctor")} aria-label="返回团队工作台" className="flex h-10 w-10 items-center justify-center border border-line bg-white hover:bg-[#F4F6F5]"><ArrowLeft className="h-4 w-4" /></button>
            <div><h1 className="text-xl font-semibold">家医服务工作队列</h1><p className="mt-1 text-xs text-navy/50">人工受理、资料补充、资源核验和居民确认</p></div>
          </div>
          <button type="button" onClick={() => void load()} className="flex items-center gap-2 border border-line bg-white px-3 py-2 text-sm font-semibold hover:bg-[#F4F6F5]"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</button>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100dvh-73px)] max-w-[1500px] grid-cols-1 border-x border-line bg-white lg:grid-cols-[430px_minmax(0,1fr)]">
        <section className="border-r border-line bg-[#F8FAF9]">
          <div className="border-b border-line p-4">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/35" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索居民、手机号或服务" className="h-10 w-full border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-sage" /></div>
            <div className="mt-3 grid grid-cols-4 gap-1 border border-line bg-white p-1">
              {([
                ["all", "全部"], ["new", "新申请"], ["action", "待居民"], ["processing", "处理中"],
              ] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setFilter(id)} className={`px-2 py-2 text-xs font-semibold ${filter === id ? "bg-navy text-white" : "text-navy/55 hover:bg-[#F4F6F5]"}`}>{label}<span className="ml-1 opacity-70">{counts[id]}</span></button>)}
            </div>
          </div>

          <div className="max-h-[calc(100dvh-184px)] overflow-y-auto">
            {loading ? <QueueState icon={RefreshCw} text="正在读取工作队列..." /> : error ? <QueueState icon={CircleAlert} text={error} /> : visibleItems.length ? visibleItems.map((item) => {
              const person = relation(item.resident);
              const active = item.id === selectedId;
              const urgent = ["high", "emergency"].includes(item.priority);
              return (
                <button key={item.id} type="button" onClick={() => chooseItem(item.id)} className={`block w-full border-b border-line px-4 py-4 text-left transition-colors ${active ? "bg-white shadow-[inset_3px_0_0_#2F6C56]" : "hover:bg-white"}`}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{person?.display_name ?? "居民"} · {item.title}</p><p className="mt-1 text-xs text-navy/42">{formatDate(item.created_at)}</p></div><span className={`shrink-0 px-2 py-1 text-[11px] font-semibold ${urgent ? "bg-risk-soft text-danger" : "bg-health-soft text-sage"}`}>{serviceStatusLabels[item.status]}</span></div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-navy/58">{item.summary}</p>
                </button>
              );
            }) : <QueueState icon={CheckCircle2} text="当前筛选下没有待处理申请。" />}
          </div>
        </section>

        <section className="min-w-0 bg-white">
          {selected ? (
            <div className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_390px]">
              <div className="min-w-0 border-r border-line">
                <div className="border-b border-line px-6 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold text-sage">{serviceStatusLabels[selected.status]}</p><h2 className="mt-1 text-xl font-semibold">{selected.title}</h2><p className="mt-2 text-sm text-navy/48">申请于 {new Date(selected.created_at).toLocaleString("zh-CN")}</p></div><span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${["high", "emergency"].includes(selected.priority) ? "bg-risk-soft text-danger" : "bg-[#F1F4F3] text-navy/55"}`}>{["high", "emergency"].includes(selected.priority) ? <CircleAlert className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{selected.priority === "emergency" ? "紧急" : selected.priority === "high" ? "高优先" : "常规"}</span></div>
                </div>

                <div className="space-y-7 px-6 py-6">
                  <section><h3 className="flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4 text-sage" />居民与申请</h3><div className="mt-3 grid gap-x-6 gap-y-3 border-y border-line py-4 sm:grid-cols-2"><Detail label="居民" value={resident?.display_name ?? "未命名居民"} /><Detail label="联系电话" value={resident?.phone ?? "未留手机号"} /><Detail label="服务类型" value={serviceTypeLabels[selected.service_type] ?? "家医服务"} /><Detail label="当前经办人" value={assignee?.display_name ?? "尚未认领"} /></div><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-navy/72">{selected.summary}</p></section>

                  {sourceContext ? <section className="rounded-md border border-sage/20 bg-health-soft/45 p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-sage" />居民引用的已审核内容</h3><p className="mt-2 text-sm font-semibold">{sourceContext.title ?? "已审核内容"}</p><p className="mt-1 text-xs text-navy/50">{sourceContext.sourceName ?? "官方来源"}{sourceContext.reviewedAt ? ` · 核验于 ${new Date(sourceContext.reviewedAt).toLocaleDateString("zh-CN")}` : ""}</p>{sourceContext.originalUrl ? <a href={sourceContext.originalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-sage">打开官方原文核对</a> : null}</section> : null}
                  {appointment ? <section><h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-sage" />预约偏好与回执</h3><div className="mt-3 grid gap-x-6 gap-y-3 border-y border-line py-4 sm:grid-cols-2"><Detail label="目标" value={appointment.target ?? "未填写"} /><Detail label="期望日期" value={appointment.preferred_dates?.join("、") ?? "未填写"} /><Detail label="期望时段" value={appointment.preferred_time ?? "未填写"} /><Detail label="期望科室/医生" value={[appointment.department, appointment.preferred_doctor].filter(Boolean).join(" · ") || "未指定"} />{appointment.scheduled_at ? <Detail label="已提出时间" value={new Date(appointment.scheduled_at).toLocaleString("zh-CN")} /> : null}{appointment.institution_name ? <Detail label="机构与科室" value={[appointment.institution_name, appointment.department_name, appointment.clinician_name].filter(Boolean).join(" · ")} /> : null}</div></section> : null}

                  <section><h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-sage" />Claw 接诊前摘要</h3>{briefLoading ? <p className="mt-3 text-sm text-navy/45">正在读取摘要...</p> : briefs.length ? <div className="mt-3 border-l-2 border-sage bg-[#F7FAF8] px-4 py-3"><p className="text-sm leading-7 text-navy/72">{briefs[0].summary}</p><p className="mt-2 text-[11px] text-navy/38">{briefs[0].skill_id} · {briefs[0].skill_version} · {formatDate(briefs[0].created_at)}</p></div> : <p className="mt-3 border border-dashed border-line px-4 py-5 text-sm text-navy/45">当前没有可用摘要，请以居民原始资料和沟通结果为准。</p>}</section>

                  <section><h3 className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck className="h-4 w-4 text-sage" />办理记录</h3><div className="mt-3 divide-y divide-line border-y border-line">{[...(selected.service_request_events ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((event) => <div key={event.id} className="flex gap-4 py-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sage" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{serviceStatusLabels[event.new_status as ServiceStatus] ?? event.action}</p><p className="shrink-0 text-[11px] text-navy/38">{formatDate(event.created_at)}</p></div>{event.note ? <p className="mt-1 text-xs leading-5 text-navy/55">{event.note}</p> : null}</div></div>)}</div></section>
                </div>
              </div>

              <aside className="bg-[#F8FAF9] px-5 py-6 xl:sticky xl:top-0 xl:h-[calc(100dvh-73px)] xl:overflow-y-auto">
                <h3 className="text-sm font-semibold">下一步处理</h3>
                <p className="mt-1 text-xs leading-5 text-navy/48">选择动作、补全对居民可见的信息，再提交状态变化。</p>
                {!canAct ? <div className="mt-4 border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">该申请已由 {assignee?.display_name ?? "其他工作人员"} 认领。您可以查看资料，但不能直接更改状态。</div> : null}
                <div className="mt-4 space-y-2">{canAct ? (actionOptions[selected.status] ?? []).map((option) => <button key={option.action} type="button" onClick={() => resetComposer(option.action)} className={`flex w-full items-center justify-between border px-3 py-3 text-left ${selectedAction === option.action ? "border-navy bg-navy text-white" : "border-line bg-white hover:border-sage/50"}`}><span><span className="block text-sm font-semibold">{option.label}</span><span className={`mt-1 block text-xs ${selectedAction === option.action ? "text-white/60" : "text-navy/45"}`}>{option.description}</span></span><ChevronRight className="h-4 w-4 shrink-0" /></button>) : null}</div>

                {canAct && selectedAction ? <div className="mt-5 border-t border-line pt-5">
                  {selectedAction === "propose_slot" ? <div className="space-y-3"><FieldLabel text="预约时间（必填）" /><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="h-11 w-full border border-line bg-white px-3 text-sm outline-none focus:border-sage" /><FieldLabel text="机构名称（必填）" /><input value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="正式机构全称" className="h-11 w-full border border-line bg-white px-3 text-sm outline-none focus:border-sage" /><div className="grid grid-cols-2 gap-2"><input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="科室" className="h-11 min-w-0 border border-line bg-white px-3 text-sm outline-none focus:border-sage" /><input value={clinician} onChange={(event) => setClinician(event.target.value)} placeholder="医生" className="h-11 min-w-0 border border-line bg-white px-3 text-sm outline-none focus:border-sage" /></div><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="预约编号（可稍后回写）" className="h-11 w-full border border-line bg-white px-3 text-sm outline-none focus:border-sage" /></div> : null}
                  <div className="mt-3"><FieldLabel text={["request_info", "fail"].includes(selectedAction) ? "给居民的说明（必填）" : "给居民的说明"} /><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} placeholder={selectedAction === "request_info" ? "请具体说明需要补充哪份资料、什么时间范围。" : "该说明会进入居民进度和审计记录。"} className="mt-2 w-full resize-none border border-line bg-white p-3 text-sm leading-6 outline-none focus:border-sage" /></div>
                  <button type="button" disabled={submitting} onClick={() => void submitAction()} className="mt-4 flex w-full items-center justify-center gap-2 bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><Stethoscope className="h-4 w-4" />{submitting ? "正在提交..." : "确认并更新状态"}</button>
                </div> : canAct ? <div className="mt-5 border border-dashed border-line bg-white px-4 py-8 text-center text-sm text-navy/45">{(actionOptions[selected.status] ?? []).length ? "选择上方处理动作后填写。" : "当前状态等待居民操作或没有可执行动作。"}</div> : null}
              </aside>
            </div>
          ) : <QueueState icon={CheckCircle2} text="选择左侧申请后开始处理。" />}
        </section>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] text-navy/38">{label}</p><p className="mt-1 break-words text-sm font-medium text-navy/72">{value}</p></div>;
}

function FieldLabel({ text }: { text: string }) {
  return <label className="block text-xs font-semibold text-navy/58">{text}</label>;
}

function QueueState({ icon: Icon, text }: { icon: typeof RefreshCw; text: string }) {
  return <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><Icon className="h-8 w-8 text-navy/25" /><p className="mt-3 text-sm leading-6 text-navy/48">{text}</p></div>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, CheckCircle2, CircleAlert, Clock3, RefreshCw, UserRoundCheck } from "lucide-react";
import type { ServiceAction, ServiceStatus } from "@jiayi/contracts";
import { useToast } from "@/components/ToastProvider";
import { serviceStatusLabels } from "@/lib/serviceRequests/stateMachine";

type WorkItem = {
  id: string;
  title: string;
  summary: string;
  status: ServiceStatus;
  priority: "low" | "medium" | "high" | "emergency";
  service_type: string;
  created_at: string;
  resident?: { id: string; display_name: string; phone: string | null } | Array<{ id: string; display_name: string; phone: string | null }>;
  appointment_details?: Record<string, unknown> | Array<Record<string, unknown>> | null;
};

const quickActions: Partial<Record<ServiceStatus, Array<{ action: ServiceAction; label: string }>>> = {
  submitted: [{ action: "accept", label: "受理" }, { action: "request_info", label: "请居民补充" }],
  needs_info: [],
  accepted: [{ action: "check_availability", label: "开始确认号源" }, { action: "request_info", label: "请居民补充" }],
  checking_availability: [{ action: "propose_slot", label: "提出预约时间" }, { action: "waitlist", label: "转候补" }, { action: "fail", label: "暂未约成" }],
  waitlisted: [{ action: "propose_slot", label: "已有可用时间" }, { action: "fail", label: "结束候补" }],
  booked: [{ action: "complete", label: "服务完成" }],
};

export default function WorkbenchRequestsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [institution, setInstitution] = useState("");
  const [department, setDepartment] = useState("");
  const [clinician, setClinician] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/v1/staff/work-queue", { cache: "no-store" });
    const payload = await response.json();
    if (response.status === 401) router.replace("/login");
    else if (!response.ok) showToast(payload.error?.message ?? "工作队列读取失败。", "warning");
    else setItems(payload.data.requests ?? []);
    setLoading(false);
  }, [router, showToast]);

  useEffect(() => { void load(); }, [load]);

  async function run(item: WorkItem, action: ServiceAction) {
    if (action === "propose_slot" && !scheduledAt) {
      setSelected(item);
      return showToast("请先填写准备提供给居民确认的时间。", "warning");
    }
    const response = await fetch(`/api/v1/service-requests/${item.id}/actions/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note: note || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        institutionName: institution || null,
        departmentName: department || null,
        clinicianName: clinician || null,
        bookingReference: reference || null,
      }),
    });
    const payload = await response.json();
    if (!response.ok) return showToast(payload.error?.message ?? "状态更新失败。", "warning");
    showToast("服务状态已更新，并写入审计记录。", "success");
    setSelected(null); setNote(""); setScheduledAt(""); setInstitution(""); setDepartment(""); setClinician(""); setReference("");
    await load();
  }

  return (
    <main className="min-h-screen bg-[#F7F3EC] text-navy">
      <header className="border-b border-line bg-white/90"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><div className="flex items-center gap-3"><button type="button" onClick={() => router.push("/doctor")} aria-label="返回团队工作台" className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-white"><ArrowLeft className="h-4 w-4" /></button><div><h1 className="text-xl font-semibold">家医服务工作队列</h1><p className="mt-1 text-xs text-navy/50">真实预约、补充资料和处理回执</p></div></div><button type="button" onClick={() => void load()} className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" />刷新</button></div></header>
      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <div className="mb-4 grid grid-cols-3 gap-3"><Metric label="待处理" value={items.filter((item) => item.status === "submitted").length} /><Metric label="确认号源中" value={items.filter((item) => ["accepted", "checking_availability", "waitlisted"].includes(item.status)).length} /><Metric label="等待居民确认" value={items.filter((item) => item.status === "awaiting_user_confirmation").length} /></div>
          {loading ? <div className="border border-line bg-white p-10 text-center text-sm text-navy/50">正在读取工作队列...</div> : items.length ? <div className="divide-y divide-line border border-line bg-white">{items.map((item) => { const resident = Array.isArray(item.resident) ? item.resident[0] : item.resident; return <article key={item.id} className={`p-5 ${selected?.id === item.id ? "bg-health-soft" : ""}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-semibold">{item.title}</h2>{item.priority === "high" || item.priority === "emergency" ? <CircleAlert className="h-4 w-4 text-danger" /> : null}</div><p className="mt-1 text-xs text-navy/48">{resident?.display_name ?? "居民"} · {new Date(item.created_at).toLocaleString("zh-CN")}</p></div><span className="rounded-full bg-health-soft px-3 py-1 text-xs font-semibold text-sage">{serviceStatusLabels[item.status]}</span></div><p className="mt-3 text-sm leading-6 text-navy/70">{item.summary}</p><div className="mt-4 flex flex-wrap gap-2">{(quickActions[item.status] ?? []).map((action) => <button key={action.action} type="button" onClick={() => { setSelected(item); if (action.action !== "propose_slot") void run(item, action.action); }} className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">{action.label}</button>)}<button type="button" onClick={() => setSelected(item)} className="rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold">查看和补充处理信息</button></div></article>; })}</div> : <div className="border border-dashed border-line bg-white p-10 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-success/60" /><p className="mt-3 text-sm text-navy/55">当前没有待处理的服务申请。</p></div>}
        </section>
        <aside className="border border-line bg-white p-5 lg:sticky lg:top-5 lg:h-fit"><h2 className="flex items-center gap-2 font-semibold"><CalendarClock className="h-5 w-5 text-sage" />处理信息</h2>{selected ? <div className="mt-4 space-y-3"><p className="rounded-md bg-health-soft p-3 text-sm leading-6">正在处理：{selected.title}</p><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="h-11 w-full rounded-md border border-line px-3" /><input value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="机构名称" className="h-11 w-full rounded-md border border-line px-3" /><div className="grid grid-cols-2 gap-2"><input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="科室" className="h-11 min-w-0 rounded-md border border-line px-3" /><input value={clinician} onChange={(event) => setClinician(event.target.value)} placeholder="医生" className="h-11 min-w-0 rounded-md border border-line px-3" /></div><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="预约编号（确认成功后填写）" className="h-11 w-full rounded-md border border-line px-3" /><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="给居民的处理说明" className="w-full resize-none rounded-md border border-line p-3" />{selected.status === "checking_availability" || selected.status === "waitlisted" ? <button type="button" onClick={() => void run(selected, "propose_slot")} className="flex w-full items-center justify-center gap-2 rounded-md bg-success px-3 py-2.5 text-sm font-semibold text-white"><UserRoundCheck className="h-4 w-4" />提交预约时间给居民确认</button> : null}</div> : <div className="mt-4 rounded-md border border-dashed border-line p-6 text-center text-sm text-navy/48"><Clock3 className="mx-auto mb-2 h-7 w-7" />选择左侧申请后填写。</div>}</aside>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="border border-line bg-white p-4"><p className="text-xs text-navy/48">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}

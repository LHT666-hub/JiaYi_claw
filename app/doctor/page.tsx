"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Clock3,
  MessageCircleMore,
  RefreshCw,
  UserRoundCheck,
  Users,
} from "lucide-react";
import type { ServiceStatus } from "@jiayi/contracts";
import { WorkbenchHeader } from "@/components/workbench/WorkbenchHeader";
import { serviceStatusLabels } from "@/lib/serviceRequests/stateMachine";

type QueueSummary = { total: number; unassigned: number; overdue: number; highRisk: number; waitingForResident: number; teamAction: number };
type QueueItem = {
  id: string;
  title: string;
  summary: string;
  status: ServiceStatus;
  priority: "low" | "medium" | "high" | "emergency";
  service_type: string;
  created_at: string;
  resident?: { display_name?: string; phone?: string } | Array<{ display_name?: string; phone?: string }>;
  presentation: { overdue: boolean; unassigned: boolean; waitingForResident: boolean; staleHours: number; nextActionLabel: string };
};

const roleLabels: Record<string, string> = { doctor: "家庭医生", nurse: "团队护士", pharmacist: "药师", community: "社区人员", admin: "管理员" };
function relation<T>(value: T | T[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}

export default function DoctorPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<{ id: string; role: string; displayName: string } | null>(null);
  const [summary, setSummary] = useState<QueueSummary>({ total: 0, unassigned: 0, overdue: 0, highRisk: 0, waitingForResident: 0, teamAction: 0 });
  const [requests, setRequests] = useState<QueueItem[]>([]);
  const [facts, setFacts] = useState<Array<Record<string, unknown>>>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [work, group] = await Promise.all([
        fetch("/api/v1/staff/work-queue", { cache: "no-store" }),
        fetch("/api/v1/staff/group-work-queue", { cache: "no-store" }),
      ]);
      if (work.status === 401 || work.status === 403) return router.replace("/staff/login");
      const workPayload = await work.json(); const groupPayload = await group.json();
      if (!work.ok) throw new Error(workPayload.error?.message ?? "工作队列加载失败");
      setProfile(workPayload.data.profile); setSummary(workPayload.data.summary); setRequests(workPayload.data.requests ?? []); setIsDemo(Boolean(workPayload.data.demo));
      if (group.ok) setFacts(groupPayload.data.candidates ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "工作队列加载失败"); }
    finally { setLoading(false); }
  }, [router]);
  useEffect(() => { void load(); }, [load]);

  const focusItems = useMemo(() => requests.filter((item) => item.presentation.overdue || item.priority === "emergency" || item.priority === "high" || item.presentation.unassigned).slice(0, 6), [requests]);

  return <main className="min-h-dvh bg-[#F2F5F4] text-navy">
    <WorkbenchHeader title="今日总览" subtitle="先处理高风险、超时和无人认领的居民服务" profile={profile ? { displayName: profile.displayName, role: roleLabels[profile.role] ?? profile.role } : null} actions={<button type="button" onClick={() => void load()} aria-label="刷新工作台" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line bg-white text-navy/55 hover:bg-[#F4F7F6]"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>} />
    <div className="mx-auto max-w-[1500px] px-3 py-4 sm:px-5 sm:py-6">
      {isDemo ? <div className="mb-4 flex items-center gap-2 rounded-[16px] border border-sage/20 bg-health-soft px-4 py-3 text-xs font-semibold text-sage sm:mb-5 sm:rounded-[8px]"><CheckCircle2 className="h-4 w-4 shrink-0" />全功能演示模式已开启，可进入队列模拟处理，不写入真实居民数据。</div> : null}
      {error ? <div className="mb-4 rounded-[16px] border border-danger/20 bg-risk-soft px-4 py-3 text-sm text-danger sm:mb-5 sm:rounded-[8px]">{error}</div> : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <Metric label="需团队处理" value={summary.teamAction} note="当前可执行" icon={ClipboardList} tone="navy" />
        <Metric label="首响已超时" value={summary.overdue} note="优先响应" icon={Clock3} tone="danger" />
        <Metric label="高风险优先" value={summary.highRisk} note="高优先/紧急" icon={CircleAlert} tone="amber" />
        <Metric label="尚未认领" value={summary.unassigned} note="需要分工" icon={Users} tone="blue" />
        <Metric label="等居民回复" value={summary.waitingForResident} note="暂不催办" icon={MessageCircleMore} tone="sage" />
        <Metric label="群事实待确认" value={facts.length} note="确认后入档" icon={UserRoundCheck} tone="purple" />
      </section>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="overflow-hidden rounded-[20px] border border-line bg-white sm:rounded-[8px]">
          <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="text-sm font-semibold">今日优先处理</h2><p className="mt-1 text-xs text-navy/42">按风险、超时、无人认领和停留时间排序</p></div><Link href="/workbench/requests" className="flex items-center gap-1 text-xs font-semibold text-sage">全部队列<ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
          {loading && !requests.length ? <div className="p-10 text-center text-sm text-navy/45">正在读取今日队列...</div> : focusItems.length ? <div className="divide-y divide-line">{focusItems.map((item) => { const resident = relation(item.resident); return <Link key={item.id} href={`/workbench/requests?id=${item.id}`} className="grid gap-3 px-5 py-4 transition hover:bg-[#F8FAF9] md:grid-cols-[minmax(0,1fr)_150px_130px]"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`h-2 w-2 rounded-full ${item.priority === "emergency" ? "bg-danger" : item.priority === "high" ? "bg-[#C27837]" : "bg-sage"}`} /><h3 className="truncate text-sm font-semibold">{resident?.display_name ?? "居民"} · {item.title}</h3>{item.presentation.overdue ? <span className="bg-risk-soft px-2 py-0.5 text-[10px] font-semibold text-danger">首响超时</span> : null}{item.presentation.unassigned ? <span className="bg-[#EDF2F6] px-2 py-0.5 text-[10px] font-semibold text-[#365F8A]">未认领</span> : null}</div><p className="mt-1.5 line-clamp-1 text-xs text-navy/48">{item.summary}</p></div><div><p className="text-[10px] text-navy/35">当前状态</p><p className="mt-1 text-xs font-semibold text-navy/68">{serviceStatusLabels[item.status]}</p></div><div className="flex items-center justify-between md:block"><div><p className="text-[10px] text-navy/35">下一动作</p><p className="mt-1 text-xs font-semibold text-sage">{item.presentation.nextActionLabel}</p></div><p className="text-[10px] text-navy/35 md:mt-2">{relativeTime(item.created_at)}</p></div></Link>; })}</div> : <div className="p-12 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-success" /><p className="mt-3 text-sm font-semibold">没有优先待办</p><p className="mt-1 text-xs text-navy/42">当前队列均已进入等待或正常处理。</p></div>}
        </section>

        <aside className="space-y-4">
          <section className="rounded-[20px] border border-line bg-white p-5 sm:rounded-[8px]"><div className="flex items-center gap-2"><CircleAlert className="h-4 w-4 text-sage" /><h2 className="text-sm font-semibold">当前分工</h2></div><dl className="mt-4 space-y-3 text-xs"><Row label="当前队列" value={`${summary.total} 项`} /><Row label="团队处理中" value={`${summary.teamAction} 项`} /><Row label="等待居民" value={`${summary.waitingForResident} 项`} /><Row label="无人认领" value={`${summary.unassigned} 项`} danger={summary.unassigned > 0} /></dl><Link href="/workbench/requests" className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-xs font-semibold text-white sm:rounded-[8px]">进入服务队列<ArrowUpRight className="h-3.5 w-3.5" /></Link></section>
          <section className="rounded-[20px] border border-line bg-white p-5 sm:rounded-[8px]"><h2 className="text-sm font-semibold">运营待确认</h2><p className="mt-2 text-xs leading-5 text-navy/48">签约关系、群内健康事实、排班和公众号内容均须人工核验后发布或入档。</p><Link href="/workbench/operations" className="mt-4 flex items-center justify-between border-t border-line pt-4 text-xs font-semibold text-sage"><span>打开运营协同</span><ArrowUpRight className="h-3.5 w-3.5" /></Link></section>
        </aside>
      </div>
    </div>
  </main>;
}

function Metric({ label, value, note, icon: Icon, tone }: { label: string; value: number; note: string; icon: typeof ClipboardList; tone: "navy" | "danger" | "amber" | "blue" | "sage" | "purple" }) {
  const tones = { navy: "bg-navy text-white", danger: "bg-risk-soft text-danger", amber: "bg-[#F7F0E4] text-[#916020]", blue: "bg-[#EDF2F6] text-[#365F8A]", sage: "bg-health-soft text-sage", purple: "bg-[#F2EDF4] text-[#7B5877]" };
  return <article className="min-w-0 rounded-[16px] border border-line bg-white p-3.5 sm:rounded-[8px] sm:p-4"><div className={`flex h-8 w-8 items-center justify-center rounded-[9px] sm:h-9 sm:w-9 sm:rounded-[10px] ${tones[tone]}`}><Icon className="h-4 w-4" /></div><div className="mt-3 flex items-end justify-between gap-2 sm:block"><p className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</p><p className="truncate text-[10px] text-navy/38 sm:mt-1">{note}</p></div><p className="mt-1 truncate text-xs font-semibold">{label}</p></article>;
}

function Row({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <div className="flex items-center justify-between"><dt className="text-navy/45">{label}</dt><dd className={`font-semibold ${danger ? "text-danger" : "text-navy"}`}>{value}</dd></div>; }

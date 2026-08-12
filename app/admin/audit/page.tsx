"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Search, ShieldCheck } from "lucide-react";

type AuditLog = { id: string; action: string; target_table: string | null; target_id: string | null; detail: Record<string, unknown> | null; created_at: string; actor: { display_name: string; role: string } | null };
const actionLabels: Record<string, string> = {
  "staff_invite.created": "创建人员邀请", "staff_invite.revoked": "撤销人员邀请", "staff_invite.accepted": "接受人员邀请",
  "staff_account.activated": "恢复人员账号", "staff_account.suspended": "停用人员账号",
  "service_catalog.created": "创建居民服务", "service_catalog.updated": "更新居民服务", "service_catalog.enabled": "启用居民服务", "service_catalog.disabled": "停用居民服务",
  "auth.staff_phone_login": "工作人员手机号登录",
};

export default function AdminAuditPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]); const [filter, setFilter] = useState(""); const [activeFilter, setActiveFilter] = useState("");
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async (action = activeFilter) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/v1/admin/audit?limit=100${action ? `&action=${encodeURIComponent(action)}` : ""}`, { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 401 || response.status === 403) return router.replace("/login");
      if (!response.ok) throw new Error(payload.error?.message ?? "审计日志加载失败。");
      setLogs(payload.data.logs ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "网络连接失败。"); }
    finally { setLoading(false); }
  }, [activeFilter, router]);
  useEffect(() => { void load(); }, [load]);
  function search(event: FormEvent) { event.preventDefault(); setActiveFilter(filter.trim()); }

  return <main className="min-h-dvh bg-[#F3F5F4] text-navy">
    <header className="border-b border-line bg-white"><div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4"><Link href="/admin" aria-label="返回管理后台" className="flex h-10 w-10 items-center justify-center rounded-md border border-line"><ArrowLeft className="h-4 w-4" /></Link><div className="min-w-0 flex-1"><h1 className="text-xl font-semibold">审计日志</h1><p className="mt-1 text-xs text-navy/50">查询当前机构的关键登录、权限、服务和内容变更</p></div><button type="button" onClick={() => void load()} aria-label="刷新" className="flex h-10 w-10 items-center justify-center rounded-md border border-line"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div></header>
    <div className="mx-auto max-w-7xl px-5 py-6">
      <form onSubmit={search} className="flex max-w-xl gap-2"><label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-white px-3"><Search className="h-4 w-4 text-navy/40" /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="按动作筛选，例如 staff 或 content" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><button className="rounded-md bg-navy px-5 text-sm font-semibold text-white">查询</button></form>
      {error ? <div className="mt-4 rounded-md border border-danger/20 bg-risk-soft p-4 text-sm text-danger">{error}</div> : null}
      <section className="mt-5 overflow-hidden rounded-md border border-line bg-white"><div className="grid grid-cols-[minmax(180px,1.3fr)_minmax(150px,1fr)_minmax(170px,1fr)_170px] gap-4 border-b border-line bg-[#EEF2F0] px-4 py-3 text-xs font-semibold text-navy/55"><span>动作</span><span>操作者</span><span>对象</span><span>时间</span></div>
        {loading ? <div className="h-40 animate-pulse bg-white" /> : logs.length ? <div className="divide-y divide-line">{logs.map((item) => <details key={item.id} className="group"><summary className="grid cursor-pointer list-none grid-cols-[minmax(180px,1.3fr)_minmax(150px,1fr)_minmax(170px,1fr)_170px] gap-4 px-4 py-3 text-sm hover:bg-[#F7F8F7]"><span className="font-semibold">{actionLabels[item.action] ?? item.action}</span><span className="text-navy/60">{item.actor?.display_name ?? "系统"}{item.actor?.role ? ` · ${item.actor.role}` : ""}</span><span className="truncate font-mono text-xs text-navy/55">{item.target_table ?? "-"}{item.target_id ? ` / ${item.target_id.slice(0, 8)}` : ""}</span><time className="text-xs text-navy/50">{new Date(item.created_at).toLocaleString("zh-CN")}</time></summary>{item.detail && Object.keys(item.detail).length ? <pre className="overflow-x-auto border-t border-line bg-[#F7F8F7] px-4 py-3 text-xs leading-5 text-navy/60">{JSON.stringify(item.detail, null, 2)}</pre> : null}</details>)}</div> : <div className="px-6 py-16 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-sage" /><p className="mt-3 text-sm font-semibold">没有符合条件的审计记录</p></div>}
      </section><p className="mt-3 text-xs leading-5 text-navy/45">默认显示最近 100 条。审计日志仅用于安全核查，不在此页面修改或删除。</p>
    </div>
  </main>;
}

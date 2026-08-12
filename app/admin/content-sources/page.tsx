"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Power, PowerOff } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

type Source = Record<string, unknown>;

export default function ContentSourcesPage() {
  const { showToast } = useToast();
  const [sources, setSources] = useState<Source[]>([]);
  const [institutions, setInstitutions] = useState<Source[]>([]);
  const [candidateCount, setCandidateCount] = useState(0);
  const [source, setSource] = useState({ name: "", sourceType: "wechat_article", sourceUrl: "", institutionId: "" });
  const [ingest, setIngest] = useState({ sourceId: "", url: "", category: "activity" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/admin/content-sources", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      setSources(payload.data.sources ?? []);
      setInstitutions(payload.data.institutions ?? []);
      setCandidateCount(payload.data.candidates?.length ?? 0);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/admin/content-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...source, institutionId: source.institutionId || null }) });
      const payload = await response.json();
      if (!response.ok) return showToast(payload.error?.message ?? "添加失败", "warning");
      showToast("官方内容来源已登记。", "success");
      setSource({ name: "", sourceType: "wechat_article", sourceUrl: "", institutionId: "" });
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function run(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/admin/content-sources/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ingest) });
      const payload = await response.json();
      if (!response.ok) return showToast(payload.error?.message ?? "采集失败", "warning");
      showToast(payload.data.requiresReview === false ? "文章未发生变化，继续保持已发布状态。" : "候选内容已生成，等待人工审核。", "success");
      setIngest((value) => ({ ...value, url: "" }));
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleSource(item: Source) {
    const response = await fetch("/api/v1/admin/content-sources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, active: !item.active }) });
    const payload = await response.json();
    if (!response.ok) return showToast(payload.error?.message ?? "来源状态更新失败", "warning");
    showToast(item.active ? "来源已停用，不再允许采集。" : "来源已重新启用。", "success");
    await load();
  }

  async function bindInstitution(item: Source, institutionId: string) {
    const response = await fetch("/api/v1/admin/content-sources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, institutionId: institutionId || null }) });
    const payload = await response.json();
    if (!response.ok) return showToast(payload.error?.message ?? "来源机构更新失败", "warning");
    showToast("来源适用机构已更新。", "success");
    await load();
  }

  const input = "h-11 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-sage";
  const importableSources = sources.filter((item) => item.active && ["official_website", "wechat_article"].includes(String(item.source_type)));

  return <main className="min-h-dvh bg-[#F3F5F4] text-navy">
    <header className="border-b border-line bg-white"><div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4">
      <Link href="/admin" aria-label="返回管理台" className="flex h-10 w-10 items-center justify-center rounded-md border border-line"><ArrowLeft className="h-4 w-4" /></Link>
      <div><h1 className="text-xl font-semibold">官方内容来源</h1><p className="mt-1 text-xs text-navy/50">只采集摘要与原文入口，全部候选内容人工审核</p></div>
    </div></header>
    <div className="mx-auto max-w-6xl px-5 py-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={add} className="rounded-md border border-line bg-white p-5">
          <h2 className="font-semibold">登记官方来源</h2>
          <p className="mt-2 text-xs leading-5 text-navy/50">官网允许采集同域名页面；微信公众号只信任登记的单篇文章链接。</p>
          <div className="mt-4 grid gap-3">
            <input required value={source.name} onChange={(event) => setSource({ ...source, name: event.target.value })} placeholder="来源名称，例如海湾镇官方发布" className={input} />
            <select value={source.sourceType} onChange={(event) => setSource({ ...source, sourceType: event.target.value })} className={input}><option value="wechat_article">微信公众号单篇文章</option><option value="official_website">官方网站</option><option value="rss">RSS（结构化接入）</option><option value="open_api">开放接口（结构化接入）</option><option value="manual">人工维护</option></select>
            <select value={source.institutionId} onChange={(event) => setSource({ ...source, institutionId: event.target.value })} className={input}><option value="">全社区通用来源</option>{institutions.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select>
            <input required type="url" value={source.sourceUrl} onChange={(event) => setSource({ ...source, sourceUrl: event.target.value })} placeholder="HTTPS 官方主页或文章地址" className={input} />
            <button disabled={submitting} className="rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">登记来源</button>
          </div>
        </form>
        <form onSubmit={run} className="rounded-md border border-line bg-white p-5">
          <h2 className="font-semibold">导入文章候选</h2>
          <p className="mt-2 text-xs leading-5 text-navy/50">只提取标题、封面、发布时间和必要摘要，不复制正文。</p>
          <div className="mt-4 grid gap-3">
            <select required value={ingest.sourceId} onChange={(event) => setIngest({ ...ingest, sourceId: event.target.value })} className={input}><option value="">选择已启用来源</option>{importableSources.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select>
            <input required type="url" value={ingest.url} onChange={(event) => setIngest({ ...ingest, url: event.target.value })} placeholder="官方文章 URL" className={input} />
            <select value={ingest.category} onChange={(event) => setIngest({ ...ingest, category: event.target.value })} className={input}><option value="activity">活动</option><option value="health_classroom">家医小课堂</option><option value="notice">通知</option><option value="schedule_notice">排班通知</option><option value="policy">政策</option></select>
            <button disabled={submitting} className="rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">安全采集并送审</button>
          </div>
        </form>
      </div>
      <section className="mt-6 rounded-md border border-line bg-white p-5">
        <div className="flex items-center justify-between"><h2 className="font-semibold">来源台账</h2><Link href="/workbench/operations" className="text-sm font-semibold text-sage">待审核 {candidateCount} 条</Link></div>
        {sources.length ? <div className="mt-4 divide-y divide-line">{sources.map((item) => <div key={String(item.id)} className="flex items-center gap-3 py-3">
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="text-sm font-semibold">{String(item.name)}</p><span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${item.active ? "bg-health-soft text-sage" : "bg-[#F2F2F2] text-navy/40"}`}>{item.active ? "启用" : "停用"}</span></div><div className="mt-1 flex flex-wrap items-center gap-2"><select aria-label="适用机构" value={String(item.institution_id ?? "")} onChange={(event) => void bindInstitution(item, event.target.value)} className="h-8 max-w-[240px] rounded border border-line bg-white px-2 text-xs text-navy"><option value="">全社区通用</option>{institutions.map((institution) => <option key={String(institution.id)} value={String(institution.id)}>{String(institution.name)}</option>)}</select><span className="text-xs text-navy/45">{String(item.source_type)}</span></div><p className="mt-1 truncate text-xs text-navy/45">{String(item.source_url)}</p>{item.last_error ? <p className="mt-1 text-xs text-danger">最近采集失败：{String(item.last_error)}</p> : null}</div>
          <button type="button" onClick={() => void toggleSource(item)} aria-label={item.active ? "停用来源" : "启用来源"} className="flex h-9 w-9 items-center justify-center rounded-md border border-line">{item.active ? <PowerOff className="h-4 w-4 text-danger" /> : <Power className="h-4 w-4 text-sage" />}</button>
          <a href={String(item.source_url)} target="_blank" rel="noreferrer" aria-label="打开来源"><ExternalLink className="h-4 w-4 text-sage" /></a>
        </div>)}</div> : <p className="mt-5 text-sm text-navy/45">尚未登记正式来源。</p>}
      </section>
    </div>
  </main>;
}

"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, ExternalLink, Search } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";

type Item = {
  id: string;
  title: string;
  category: string;
  content: string;
  sourceName: string;
  sourceUrl: string;
  verifiedAt: string;
  stale: boolean;
};

const suggestions = ["门诊时间", "疫苗接种", "体检活动", "家庭医生签约"];

export default function PublicInfoPage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search(nextQuery: string, event?: FormEvent) {
    event?.preventDefault();
    const normalized = nextQuery.trim();
    if (!normalized) return;
    setQuery(normalized);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/public-info?q=${encodeURIComponent(normalized)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "查询暂时不可用");
      setItems(payload.data?.items ?? []);
      setSearched(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "查询暂时不可用");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PhoneShell>
      <main className="space-y-5 px-4 pb-10">
        <BackHeader title="海湾镇公开信息" />

        <section className="rounded-[28px] border border-sage/15 bg-health-soft/75 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-white text-sage shadow-[0_8px_20px_rgba(16,42,67,0.06)]">
              <BookOpen className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-navy">访客只读查询</p>
              <p className="mt-1 text-xs leading-5 text-navy/52">不保存健康资料。登录后才能预约、代办和查看服务进度。</p>
            </div>
          </div>
        </section>

        <form onSubmit={(event) => void search(query, event)} className="flex gap-2">
          <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[20px] border border-line bg-surface-card px-4 shadow-[0_10px_26px_rgba(16,42,67,0.05)]">
            <Search className="h-4 w-4 shrink-0 text-sage" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：接种门诊什么时候开" className="min-w-0 flex-1 bg-transparent text-sm text-navy outline-none" />
          </label>
          <button disabled={loading || !query.trim()} aria-label="搜索公开信息" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy text-white shadow-[0_12px_26px_rgba(16,42,67,0.16)] disabled:opacity-40">
            <Search className="h-5 w-5" />
          </button>
        </form>

        {!searched && !error ? (
          <section className="overflow-hidden rounded-[28px] border border-line bg-surface-card shadow-[0_14px_34px_rgba(16,42,67,0.05)]">
            <p className="px-4 pb-2 pt-4 text-xs font-semibold text-navy/42">常见查询</p>
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => void search(suggestion)} className="flex w-full items-center justify-between border-t border-line/70 px-4 py-3.5 text-left text-sm font-semibold text-navy">
                {suggestion}<ChevronRight className="h-4 w-4 text-navy/28" />
              </button>
            ))}
          </section>
        ) : null}

        {error ? <section className="rounded-[28px] border border-danger/15 bg-risk-soft p-5 text-center"><p className="text-sm font-semibold text-danger">暂时无法查询</p><p className="mt-2 text-xs leading-5 text-navy/55">{error}</p><button type="button" onClick={() => void search(query)} className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-navy">重新查询</button></section> : null}

        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-[28px] border border-line bg-surface-card p-4 shadow-[0_14px_34px_rgba(16,42,67,0.05)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><span className="text-xs font-semibold text-sage">{item.category}</span><h2 className="mt-1 text-sm font-semibold leading-6 text-navy">{item.title}</h2></div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.stale ? "bg-risk-soft text-danger" : "bg-health-soft text-success"}`}>{item.stale ? "需核验" : "已核验"}</span>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-navy/68">{item.stale ? "这条资料已经超过有效期，请通过原文或联系机构确认后再办理。" : item.content}</p>
              <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-between rounded-[18px] bg-health-soft/70 px-3.5 py-3 text-xs font-semibold text-sage">
                <span className="min-w-0 truncate">{item.sourceName} · {new Date(item.verifiedAt).toLocaleDateString("zh-CN")}</span><ExternalLink className="ml-2 h-3.5 w-3.5 shrink-0" />
              </a>
            </article>
          ))}
          {searched && !loading && !error && !items.length ? <div className="rounded-[28px] border border-dashed border-line bg-surface-card px-5 py-8 text-center text-sm leading-6 text-navy/50">没有找到已审核的信息，请换一个短关键词或联系社区卫生服务中心。</div> : null}
        </div>

        <Link href="/login" className="flex items-center justify-center gap-1 rounded-full border border-line bg-surface-card px-4 py-3 text-sm font-semibold text-navy">登录办理服务<ChevronRight className="h-4 w-4" /></Link>
      </main>
    </PhoneShell>
  );
}

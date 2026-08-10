"use client";

import { FormEvent, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";

type Item = { id: string; title: string; category: string; content: string; sourceName: string; sourceUrl: string; verifiedAt: string; stale: boolean };

export default function PublicInfoPage() {
  const [query, setQuery] = useState(""); const [items, setItems] = useState<Item[]>([]); const [searched, setSearched] = useState(false);
  async function search(event: FormEvent) { event.preventDefault(); const response = await fetch(`/api/v1/public-info?q=${encodeURIComponent(query)}`); const payload = await response.json(); setItems(payload.data?.items ?? []); setSearched(true); }
  return <PhoneShell showBottomNav><main className="space-y-5 px-4 pb-8"><BackHeader title="海湾镇公开信息" subtitle="每条回答都展示来源和核验状态。" /><form onSubmit={search} className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：接种门诊什么时候开" className="h-12 min-w-0 flex-1 rounded-md border border-line bg-surface-card px-4" /><button aria-label="搜索公开信息" className="flex h-12 w-12 items-center justify-center rounded-md bg-navy text-white"><Search className="h-5 w-5" /></button></form><div className="space-y-3">{items.map((item) => <article key={item.id} className="rounded-lg border border-line bg-surface-card p-4"><div className="flex items-start justify-between gap-3"><div><span className="text-xs font-semibold text-sage">{item.category}</span><h2 className="mt-1 font-semibold text-navy">{item.title}</h2></div><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${item.stale ? "bg-risk-soft text-danger" : "bg-health-soft text-success"}`}>{item.stale ? "待重新核验" : "有效"}</span></div><p className="mt-3 whitespace-pre-line text-sm leading-6 text-navy/68">{item.stale ? "该资料更新时间较早，请先通过原始来源或社区机构核实后再办理。" : item.content}</p><a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 text-xs font-semibold text-sage">{item.sourceName} · {item.verifiedAt}<ExternalLink className="h-3.5 w-3.5" /></a></article>)}{searched && !items.length ? <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-navy/50">没有找到已审核的信息，请联系社区卫生服务中心核实。</div> : null}</div></main></PhoneShell>;
}

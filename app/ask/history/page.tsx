"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, ShieldCheck, Trash2 } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";

type HistoryItem = {
  id: string;
  question: string;
  answer: string | null;
  category: string | null;
  risk_level: "low" | "medium" | "high" | "emergency" | null;
  created_at: string;
};

const DEMO_HISTORY_KEY = "jiayi-claw-demo-conversation-history";

function readDemoItems() {
  try {
    return JSON.parse(sessionStorage.getItem(DEMO_HISTORY_KEY) ?? "[]") as HistoryItem[];
  } catch {
    return [];
  }
}

export default function AskHistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [retentionEnabled, setRetentionEnabled] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/v1/assistant/history", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      const isDemo = Boolean(payload.data.demo);
      setDemo(isDemo);
      setRetentionEnabled(payload.data.retentionEnabled !== false);
      setItems(isDemo ? readDemoItems() : (payload.data.items ?? []));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function clear() {
    if (!window.confirm("清除全部 Claw 对话记录？服务申请和审计轨迹不会被删除。")) return;
    if (demo) sessionStorage.removeItem(DEMO_HISTORY_KEY);
    else await fetch("/api/v1/assistant/history", { method: "DELETE" });
    setItems([]);
  }

  return (
    <PhoneShell>
      <main className="space-y-5 px-4 pb-8">
        <BackHeader title="对话记录" subtitle="仅本人可见，不自动写入健康档案" />
        <div className="flex items-center justify-between rounded-[22px] bg-health-soft px-4 py-3 text-xs text-navy/60">
          <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-sage" />{demo ? "演示环境仅保留本次浏览会话" : "记录可随时清除，办理轨迹单独留存"}</span>
          {items.length ? <button onClick={() => void clear()} className="flex items-center gap-1 font-semibold text-danger"><Trash2 className="h-3.5 w-3.5" />清除</button> : null}
        </div>
        {loading ? (
          <div className="h-28 animate-shimmer rounded-[26px]" />
        ) : !retentionEnabled ? (
          <SectionCard><p className="text-sm font-semibold text-navy">当前账号未开启对话留存</p><p className="mt-2 text-xs leading-5 text-navy/55">Claw 仍会保留必要的脱敏运行记录和服务审计，但不保存问答原文。</p></SectionCard>
        ) : items.length ? (
          <div className="space-y-3">
            {items.map((item) => (
              <article key={item.id} className="ios-material rounded-[26px] p-4">
                <p className="text-sm font-semibold leading-6 text-navy">{item.question}</p>
                {item.answer ? <p className="mt-2 line-clamp-4 text-sm leading-6 text-navy/62">{item.answer}</p> : null}
                <div className="mt-3 flex items-center justify-between text-[11px] text-navy/38"><span>{item.category ?? "Claw 对话"}</span><time>{new Date(item.created_at).toLocaleString("zh-CN")}</time></div>
              </article>
            ))}
          </div>
        ) : (
          <SectionCard><div className="py-5 text-center"><MessageCircle className="mx-auto h-7 w-7 text-sage" /><p className="mt-3 text-sm font-semibold text-navy">还没有对话记录</p><Link href="/ask" className="mt-4 inline-flex rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white">去问 Claw</Link></div></SectionCard>
        )}
      </main>
    </PhoneShell>
  );
}

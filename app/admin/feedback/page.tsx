"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, RefreshCw } from "lucide-react";

type FeedbackStatus = "open" | "in_progress" | "resolved" | "closed";
type Person = { display_name?: string | null; phone?: string | null };
type FeedbackItem = {
  id: string;
  category: string;
  content: string;
  contact_allowed: boolean;
  page_path: string | null;
  status: FeedbackStatus;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  user: Person | Person[] | null;
  resident: Person | Person[] | null;
};

const statusLabels: Record<FeedbackStatus, string> = {
  open: "待处理",
  in_progress: "处理中",
  resolved: "已解决",
  closed: "已关闭",
};
const categoryLabels: Record<string, string> = {
  service: "服务办理",
  content: "排班或内容",
  accessibility: "老人使用体验",
  privacy: "隐私与授权",
  bug: "功能异常",
  other: "其他建议",
};

function firstPerson(value: FeedbackItem["user"]) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default function AdminFeedbackPage() {
  const router = useRouter();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [status, setStatus] = useState<FeedbackStatus>("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/admin/feedback?status=${status}`, { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 401 || response.status === 403) {
        router.replace("/login");
        return;
      }
      if (!response.ok) throw new Error(payload.error?.message ?? "居民反馈加载失败。");
      setItems(payload.data.feedback ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "网络连接失败。");
    } finally {
      setLoading(false);
    }
  }, [router, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(item: FeedbackItem, nextStatus: FeedbackStatus) {
    const note = notes[item.id]?.trim() ?? "";
    if (["resolved", "closed"].includes(nextStatus) && note.length < 2) {
      setError("标记解决或关闭前，请填写处理结论。");
      return;
    }
    setSavingId(item.id);
    setError("");
    try {
      const response = await fetch("/api/v1/admin/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, status: nextStatus, resolutionNote: note || null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "反馈状态更新失败。");
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setNotes((current) => ({ ...current, [item.id]: "" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "反馈状态更新失败。");
    } finally {
      setSavingId("");
    }
  }

  const counts = useMemo(() => ({ visible: items.length }), [items.length]);

  return (
    <main className="min-h-dvh bg-[#F3F5F4] text-navy">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4">
          <Link href="/admin" aria-label="返回管理后台" className="flex h-10 w-10 items-center justify-center rounded-md border border-line">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">居民反馈</h1>
            <p className="mt-1 text-xs text-navy/50">按所属机构处理，联系居民前需确认其已授权</p>
          </div>
          <button type="button" onClick={() => void load()} aria-label="刷新" className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-white">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(Object.keys(statusLabels) as FeedbackStatus[]).map((value) => (
            <button key={value} type="button" onClick={() => setStatus(value)} className={`shrink-0 rounded-md px-4 py-2 text-sm font-semibold ${status === value ? "bg-navy text-white" : "border border-line bg-white text-navy/60"}`}>
              {statusLabels[value]}
            </button>
          ))}
        </div>

        {error ? <div className="mt-4 rounded-md border border-danger/20 bg-risk-soft px-4 py-3 text-sm text-danger">{error}</div> : null}
        <div className="mt-5 flex items-center justify-between">
          <h2 className="font-semibold">{statusLabels[status]}</h2>
          <span className="text-xs text-navy/45">当前 {counts.visible} 条</span>
        </div>

        {loading ? <div className="mt-4 h-36 animate-pulse rounded-md bg-white" /> : null}
        {!loading && !items.length ? (
          <div className="mt-4 border border-line bg-white px-6 py-14 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-sage" />
            <p className="mt-3 text-sm font-semibold">当前没有{statusLabels[status]}反馈</p>
            <p className="mt-1 text-xs text-navy/45">居民提交后会自动进入所属机构队列。</p>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3">
          {items.map((item) => {
            const user = firstPerson(item.user);
            const resident = firstPerson(item.resident);
            return (
              <article key={item.id} className="border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-health-soft px-2 py-1 text-xs font-semibold text-sage">{categoryLabels[item.category] ?? item.category}</span>
                      <span className="text-xs text-navy/40">{new Date(item.created_at).toLocaleString("zh-CN")}</span>
                    </div>
                    <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6">{item.content}</p>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-navy/55"><Clock3 className="h-3.5 w-3.5" />{statusLabels[item.status]}</span>
                </div>
                <div className="mt-4 grid gap-2 border-t border-line pt-4 text-xs text-navy/50 sm:grid-cols-3">
                  <span>提交人：{user?.display_name ?? "已注销用户"}</span>
                  <span>服务对象：{resident?.display_name ?? "未关联"}</span>
                  <span>联系：{item.contact_allowed ? user?.phone ?? "账号未登记电话" : "居民未授权联系"}</span>
                  {item.page_path ? <span className="sm:col-span-3">页面：<code>{item.page_path}</code></span> : null}
                </div>
                {item.status === "open" || item.status === "in_progress" ? (
                  <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 md:flex-row md:items-end">
                    <label className="min-w-0 flex-1 text-xs font-semibold text-navy/55">
                      处理记录
                      <textarea value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={1000} placeholder="记录核查结果或回复口径；解决和关闭时必填" className="mt-2 min-h-20 w-full rounded-md border border-line p-3 text-sm font-normal text-navy outline-none focus:border-sage" />
                    </label>
                    <div className="flex shrink-0 gap-2">
                      {item.status === "open" ? <button type="button" disabled={savingId === item.id} onClick={() => void update(item, "in_progress")} className="rounded-md border border-line px-4 py-2.5 text-sm font-semibold">开始处理</button> : null}
                      <button type="button" disabled={savingId === item.id} onClick={() => void update(item, "resolved")} className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">标记解决</button>
                    </div>
                  </div>
                ) : item.resolution_note ? <p className="mt-4 border-t border-line pt-4 text-sm text-navy/60">处理结论：{item.resolution_note}</p> : null}
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}

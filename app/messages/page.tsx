"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, ChevronRight, MessageCircleMore } from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";

type Message = { id: string; type: string; title: string; content: string; link_url: string | null; is_read: boolean; created_at: string };
export default function MessagesPage() {
  const router = useRouter(); const [messages, setMessages] = useState<Message[]>([]); const [channels, setChannels] = useState<Array<Record<string, unknown>>>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [isDemo, setIsDemo] = useState(false);
  const load = useCallback(async () => { const response = await fetch("/api/v1/messages", { cache: "no-store" }); const payload = await response.json(); if (response.status === 401) return router.replace("/login"); if (!response.ok) setError(payload.error?.message ?? "消息加载失败"); else { setMessages(payload.data.messages ?? []); setChannels(payload.data.channelBindings ?? []); setIsDemo(Boolean(payload.data.demo)); } setLoading(false); }, [router]);
  useEffect(() => { void load(); }, [load]);
  async function read(item: Message) { if (!isDemo && !item.is_read) { await fetch("/api/v1/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) }); setMessages((items) => items.map((message) => message.id === item.id ? { ...message, is_read: true } : message)); } if (item.link_url) router.push(item.link_url); }
  async function readAll() { if (isDemo) return; await fetch("/api/v1/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAllRead: true }) }); setMessages((items) => items.map((item) => ({ ...item, is_read: true }))); }
  const unread = messages.filter((item) => !item.is_read).length;
  return <PhoneShell showBottomNav><div className="space-y-4 px-4 pb-8 pt-7">
    <header className="flex items-end justify-between"><div><p className="text-xs font-semibold text-sage">服务进度与团队通知</p><h1 className="mt-1 text-xl font-semibold text-navy">消息</h1></div>{unread && !isDemo ? <button onClick={() => void readAll()} className="text-sm font-semibold text-sage">全部已读</button> : null}</header>
    {isDemo ? <div className="rounded-full border border-sage/20 bg-health-soft px-4 py-2 text-center text-xs font-semibold text-sage">只读展示数据 · 消息状态不会写入</div> : null}
    <section className="ios-material mt-5 rounded-[30px] p-4"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-health-muted text-sage"><MessageCircleMore className="h-5 w-5" /></div><div><h2 className="text-sm font-semibold text-navy">企业微信家医群</h2><p className="mt-1 text-xs leading-5 text-navy/50">{channels.length ? "已与居民账号绑定，服务事实仍需家医确认" : "尚未绑定，不影响 App 内服务办理"}</p></div></div></section>
    {loading ? <div className="py-20 text-center text-sm text-navy/50">正在读取消息...</div> : error ? <div className="mt-5 rounded-md border border-danger/20 bg-risk-soft p-4 text-sm text-danger">{error}</div> : messages.length ? <section className="mt-5 divide-y divide-line rounded-md border border-line bg-white">{messages.map((item) => <button key={item.id} onClick={() => void read(item)} className="flex w-full items-start gap-3 p-4 text-left"><span className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${item.is_read ? "bg-[#EEF2F1] text-navy/35" : "bg-health-soft text-sage"}`}><Bell className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-3"><span className="text-sm font-semibold text-navy">{item.title}</span>{!item.is_read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-danger" /> : null}</span><span className="mt-1 block text-sm leading-6 text-navy/60">{item.content}</span><span className="mt-2 block text-xs text-navy/40">{new Date(item.created_at).toLocaleString("zh-CN")}</span></span>{item.link_url ? <ChevronRight className="mt-2 h-4 w-4 text-navy/30" /> : null}</button>)}</section> : <div className="mt-5 rounded-md border border-dashed border-line p-8 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-success" /><p className="mt-3 text-sm text-navy/50">暂时没有新消息。</p></div>}
    <p className="mt-5 text-center text-xs leading-5 text-navy/40">这里只显示正式服务通知，不复制微信群聊天记录。查看服务办理请前往<Link href="/services" className="font-semibold text-sage">服务</Link>。</p>
  </div></PhoneShell>;
}

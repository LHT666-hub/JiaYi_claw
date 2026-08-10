"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, BookOpen, ClipboardList, MessageCircleMore, Settings, ShieldCheck, Stethoscope, Users } from "lucide-react";

type Metrics = { serviceRequests: number; pendingRequests: number; staff: number; publishedContent: number; contentToReview: number; factsToReview: number; verifiedSchedules: number; activeChannels: number };
export default function AdminPage() {
  const router = useRouter(); const [metrics, setMetrics] = useState<Metrics | null>(null); const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/v1/admin/overview", { cache: "no-store" }).then(async (response) => { const payload = await response.json(); if (response.status === 401 || response.status === 403) return router.replace("/login"); if (!response.ok) setError(payload.error?.message ?? "运营数据加载失败"); else setMetrics(payload.data.metrics); }).catch(() => setError("网络连接失败。")); }, [router]);
  const entries = [
    { href: "/workbench/requests", label: "服务工作队列", detail: "预约、转诊、续方和随访", icon: ClipboardList, count: metrics?.pendingRequests },
    { href: "/workbench/operations", label: "内容与群运营", detail: "内容、排班、群事实和广播", icon: MessageCircleMore, count: (metrics?.contentToReview ?? 0) + (metrics?.factsToReview ?? 0) },
    { href: "/admin/skills", label: "Agent Skill", detail: "来源、风险和评测记录", icon: ShieldCheck },
    { href: "/admin/care-network", label: "分级诊疗网络", detail: "机构、医生、排班与转诊路线", icon: Stethoscope },
    { href: "/admin/content-sources", label: "官方内容来源", detail: "公众号与网站采集送审", icon: BookOpen },
    { href: "/admin/channels", label: "企业微信渠道", detail: "官方回调、绑定与群通知", icon: MessageCircleMore },
    { href: "/public-info", label: "公开信息", detail: "查看居民可查询的信息", icon: BookOpen },
  ];
  const cards = [{ label: "服务申请", value: metrics?.serviceRequests ?? 0, icon: Stethoscope }, { label: "工作人员", value: metrics?.staff ?? 0, icon: Users }, { label: "已发布内容", value: metrics?.publishedContent ?? 0, icon: BookOpen }, { label: "已核验排班", value: metrics?.verifiedSchedules ?? 0, icon: Activity }];
  return <main className="min-h-dvh bg-[#F3F5F4] text-navy"><header className="border-b border-line bg-white"><div className="mx-auto max-w-7xl px-5 py-5"><p className="text-xs font-semibold text-sage">海湾镇试点 · 真实运营数据</p><h1 className="mt-1 text-2xl font-semibold">家医 Claw 管理后台</h1><p className="mt-2 text-sm text-navy/50">机构、服务、内容、排班与官方渠道统一管理</p></div></header><div className="mx-auto max-w-7xl px-5 py-6">{error ? <div className="rounded-md border border-danger/20 bg-risk-soft p-4 text-sm text-danger">{error}</div> : null}<section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map((item) => <div key={item.label} className="rounded-md border border-line bg-white p-4"><div className="flex items-center justify-between"><p className="text-sm text-navy/55">{item.label}</p><item.icon className="h-4 w-4 text-sage" /></div><p className="mt-3 text-2xl font-semibold">{item.value}</p></div>)}</section><section className="mt-6 grid gap-3 md:grid-cols-2">{entries.map((item) => <Link key={item.label} href={item.href} className="flex items-center gap-4 rounded-md border border-line bg-white p-5"><span className="flex h-11 w-11 items-center justify-center rounded-md bg-health-soft text-sage"><item.icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block font-semibold">{item.label}</span><span className="mt-1 block text-sm text-navy/50">{item.detail}</span></span>{item.count ? <span className="rounded bg-risk-soft px-2 py-1 text-xs font-semibold text-danger">{item.count}</span> : null}</Link>)}</section><section className="mt-6 rounded-md border border-line bg-white p-5"><h2 className="flex items-center gap-2 font-semibold"><Settings className="h-4 w-4 text-sage" />外部配置状态</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><Status label="企业微信渠道" active={Boolean(metrics?.activeChannels)} /><Status label="审核内容" active={Boolean(metrics?.publishedContent)} /><Status label="核验排班" active={Boolean(metrics?.verifiedSchedules)} /></div><p className="mt-4 text-xs leading-5 text-navy/45">无正式合作医院、公众号或排班来源时保持空状态，不生成虚构数据。</p></section></div></main>;
}
function Status({ label, active }: { label: string; active: boolean }) { return <div className="rounded-md bg-[#F4F6F5] p-3"><p className="text-xs text-navy/45">{label}</p><p className={`mt-1 text-sm font-semibold ${active ? "text-success" : "text-navy/55"}`}>{active ? "已配置" : "待配置"}</p></div>; }

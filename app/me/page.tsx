"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Bell, Brain, ChevronRight, ClipboardList, HeartPulse, LifeBuoy, LockKeyhole, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { ResidentPageHeader } from "@/components/ResidentPageHeader";
import { logout as clearDemoUser } from "@/lib/useDemoUser";

type MeData = { demo?: boolean; profile: { display_name: string; role: string; phone: string | null }; access?: { bindingStatus: "pending" | "active" | "revoked" | "unbound"; canSubmitService: boolean; canStoreHealthData: boolean; message: string }; network: null | { name: string; community?: { name?: string; service_phone?: string | null }; institutions?: Array<{ id: string; name: string }> }; consents: Array<{ scope: string; granted: boolean }>; observations: Array<Record<string, unknown>>; serviceRequests: Array<Record<string, unknown>>; channelBindings: Array<Record<string, unknown>>; familyBindings: Array<Record<string, unknown>> };
const roleLabels: Record<string, string> = { resident: "居民", family: "家属代办", doctor: "医生", nurse: "护士", pharmacist: "药师", community: "社区工作人员", admin: "管理员" };

export default function MePage() {
  const router = useRouter(); const [data, setData] = useState<MeData | null>(null); const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/v1/me", { cache: "no-store" }).then(async (response) => { const payload = await response.json(); if (response.status === 401) return router.replace("/login"); if (!response.ok) setError(payload.error?.message ?? "资料加载失败"); else setData(payload.data); }).catch(() => setError("网络连接失败。")); }, [router]);
  async function logout() { await fetch("/api/v1/auth/logout", { method: "POST" }); clearDemoUser(); router.replace("/login"); router.refresh(); }
  const actions = [
    { href: "/family-link", label: data?.profile.role === "family" ? "绑定与管理家人" : "家属协助授权", detail: data?.profile.role === "family" ? "使用居民授权码建立代办关系" : "生成一次性授权码邀请家属", icon: Users },
    { href: "/health-records", label: "健康记录", detail: `${data?.observations.length ?? 0} 条近期记录`, icon: HeartPulse },
    { href: "/memory", label: "CLAW 记忆", detail: "查看和管理 AI 记忆", icon: Brain },
    { href: "/appointments", label: "服务历史", detail: `${data?.serviceRequests.length ?? 0} 条近期申请`, icon: ClipboardList },
    { href: "/support", label: "帮助与反馈", detail: "联系社区、客服和提交问题", icon: LifeBuoy },
    { href: "/privacy", label: "隐私与授权", detail: `${data?.consents.filter((item) => item.granted).length ?? 0} 项有效授权`, icon: ShieldCheck },
    { href: "/notification-settings", label: "通知设置", detail: "服务进度、随访与免打扰", icon: Bell },
    { href: "/account-security", label: "账号与安全", detail: "登录状态与账号注销", icon: LockKeyhole },
  ];
  return <PhoneShell showBottomNav><div className="space-y-4 px-4 pb-8 pt-7">
    <ResidentPageHeader title="我的" />
    {data?.demo ? <div className="rounded-full border border-sage/20 bg-health-soft px-4 py-2 text-center text-xs font-semibold text-sage">演示档案</div> : null}
    {error ? <div className="mt-5 rounded-[22px] border border-danger/20 bg-risk-soft p-4 text-sm text-danger">{error}</div> : null}
    <section className="mt-5 rounded-[30px] bg-navy p-5 text-white shadow-[0_22px_48px_rgba(16,42,67,0.22)]"><div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/12 text-xl font-semibold">{data?.profile.display_name?.slice(0, 1) ?? "家"}</div><div><h2 className="font-semibold">{data?.profile.display_name ?? "正在读取资料"}</h2><p className="mt-1 text-sm text-white/65">{data ? roleLabels[data.profile.role] ?? data.profile.role : ""}{data?.profile.phone ? ` · ${data.profile.phone}` : ""}</p></div></div></section>
    <section className="mt-5 rounded-[28px] border border-line bg-white p-4 shadow-[0_14px_34px_rgba(16,42,67,0.06)]"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-health-soft text-sage"><Stethoscope className="h-5 w-5" /></span><div><p className="text-xs text-navy/45">家医服务关系</p><h2 className="mt-1 font-semibold text-navy">{data?.network?.name ?? (data?.access?.bindingStatus === "pending" ? "社区登记核验中" : "尚未绑定")}</h2><p className="mt-2 text-sm text-navy/55">{data?.network?.community?.name ?? data?.access?.message ?? "请联系社区工作人员完成绑定"}</p>{data?.network ? <p className="mt-1 text-xs text-navy/40">协作机构 {data.network.institutions?.length ?? 0} 家</p> : null}</div></div></section>
    {data?.familyBindings.length ? <section className="mt-5"><h2 className="font-semibold text-navy">我协助的家人</h2><div className="mt-3 divide-y divide-line overflow-hidden rounded-[28px] border border-line bg-white shadow-[0_14px_34px_rgba(16,42,67,0.06)]">{data.familyBindings.map((binding) => { const resident = Array.isArray(binding.resident) ? binding.resident[0] : binding.resident as Record<string, unknown> | undefined; return <div key={String(binding.resident_id)} className="flex items-center gap-3 p-4"><Users className="h-5 w-5 text-sage" /><div><p className="text-sm font-semibold">{String(resident?.display_name ?? "绑定居民")}</p><p className="mt-1 text-xs text-navy/45">{String(binding.relationship ?? "家属")}</p></div></div>; })}</div></section> : null}
    <section className="mt-6"><h2 className="font-semibold text-navy">账号与数据</h2><div className="mt-3 divide-y divide-line overflow-hidden rounded-[28px] border border-line bg-white shadow-[0_14px_34px_rgba(16,42,67,0.06)]">{actions.map((item) => <Link key={item.label} href={item.href} className="flex items-center gap-3 p-4"><span className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-health-soft text-sage"><item.icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-navy">{item.label}</span>{["健康记录", "服务历史", "隐私与授权"].includes(item.label) ? <span className="mt-1 block text-xs text-navy/55">{item.detail}</span> : null}</span><ChevronRight className="h-4 w-4 text-navy/30" /></Link>)}</div></section>
    <section className="mt-5 rounded-[28px] border border-line bg-white p-4 shadow-[0_14px_34px_rgba(16,42,67,0.06)]"><div className="flex items-center gap-2 text-sm font-semibold text-navy"><Activity className="h-4 w-4 text-sage" />企业微信渠道</div><p className="mt-2 text-sm text-navy/55">{data?.channelBindings.length ? "已绑定" : "尚未绑定"}</p></section>
    <button onClick={() => void logout()} className="mt-6 w-full rounded-full border border-line bg-white px-4 py-3 text-sm font-semibold text-navy shadow-[0_12px_28px_rgba(16,42,67,0.05)]">退出登录</button>

  </div></PhoneShell>;
}

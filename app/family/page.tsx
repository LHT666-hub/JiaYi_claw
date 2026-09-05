"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CalendarClock, ChevronRight, ClipboardList, HeartPulse, MessageCircleMore, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { serviceStatusLabels } from "@/lib/serviceRequests/stateMachine";
import type { ServiceStatus } from "@jiayi/contracts";

type FamilyBinding = {
  resident_id: string;
  relationship: string;
  is_primary: boolean;
  status: string;
  resident: { display_name?: string; phone?: string | null } | Array<{ display_name?: string; phone?: string | null }> | null;
};

type MeData = {
  profile: { display_name: string; role: string };
  familyBindings: FamilyBinding[];
};

type HomeData = {
  network: null | { name: string; community?: { name?: string; service_phone?: string | null } };
  serviceRequests: Array<{ id: string; title: string; status: string; updated_at: string }>;
  notifications: Array<{ id: string; title: string; content: string; is_read: boolean; created_at: string }>;
};

function residentName(binding: FamilyBinding) {
  const profile = Array.isArray(binding.resident) ? binding.resident[0] : binding.resident;
  return profile?.display_name ?? "已绑定居民";
}

export default function FamilyPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeData | null>(null);
  const [selectedResidentId, setSelectedResidentId] = useState("");
  const [home, setHome] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const activeBindings = useMemo(
    () => (me?.familyBindings ?? []).filter((binding) => binding.status === "active"),
    [me],
  );

  const loadMe = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/v1/me", { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 401) return router.replace("/login");
      if (!response.ok) throw new Error(payload.error?.message ?? "家属资料加载失败");
      const data = payload.data as MeData;
      if (data.profile.role !== "family") {
        router.replace("/");
        return;
      }
      setMe(data);
      const bindings = data.familyBindings.filter((binding) => binding.status === "active");
      const preferred = bindings.find((binding) => binding.is_primary) ?? bindings[0];
      setSelectedResidentId(preferred?.resident_id ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "家属资料加载失败。 ");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (!selectedResidentId) {
      setHome(null);
      return;
    }
    let active = true;
    void fetch(`/api/v1/home?residentId=${encodeURIComponent(selectedResidentId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "居民服务信息加载失败");
        if (active) setHome(payload.data);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "居民服务信息加载失败。 ");
      });
    return () => {
      active = false;
    };
  }, [selectedResidentId]);

  const selectedBinding = activeBindings.find((binding) => binding.resident_id === selectedResidentId);

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <div className="relative">
          <BackHeader backHref="/" title="家属协助" subtitle={me ? `${me.profile.display_name} · 仅查看已授权家人` : "读取授权关系中"} />
          <Link href="/login?switch=1" className="absolute right-1 top-9 rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-sage shadow-sm">切换身份</Link>
        </div>

        {error ? <div className="rounded-[24px] border border-danger/20 bg-risk-soft p-4 text-sm leading-6 text-danger">{error}<button type="button" onClick={() => void loadMe()} className="mt-3 block font-semibold underline">重新加载</button></div> : null}
        {loading ? <SectionCard><div className="py-12 text-center text-sm text-navy/50">正在读取已授权家人</div></SectionCard> : null}

        {!loading && !activeBindings.length ? (
          <SectionCard>
            <div className="py-4 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-health-soft text-sage"><Users className="h-6 w-6" /></div><h1 className="mt-4 text-lg font-semibold text-navy">还没有绑定家人</h1><p className="mt-2 text-sm leading-6 text-navy/58">请让居民本人在“我的 - 家属协助授权”生成 8 位授权码。绑定前不会显示其健康资料和服务进度。</p><button type="button" onClick={() => router.push("/family-link")} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4" />输入居民授权码</button></div>
          </SectionCard>
        ) : null}

        {activeBindings.length ? (
          <section className="ios-control rounded-[26px] p-2">
            <div className="flex gap-2 overflow-x-auto">{activeBindings.map((binding) => <button key={binding.resident_id} type="button" onClick={() => setSelectedResidentId(binding.resident_id)} className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${binding.resident_id === selectedResidentId ? "bg-navy text-white shadow-[0_10px_22px_rgba(16,42,67,0.18)]" : "bg-surface-card text-navy/60"}`}>{residentName(binding)}</button>)}</div>
          </section>
        ) : null}

        {selectedBinding ? (
          <section className="rounded-[30px] bg-navy p-5 text-white shadow-[0_22px_48px_rgba(16,42,67,0.22)]">
            <div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xl font-semibold">{residentName(selectedBinding).slice(0, 1)}</div><div className="min-w-0 flex-1"><h1 className="truncate text-lg font-semibold">{residentName(selectedBinding)}</h1><p className="mt-1 text-sm text-white/64">{selectedBinding.relationship} · 已授权代办</p></div><ShieldCheck className="h-5 w-5 text-white/70" /></div>
            <div className="mt-5 rounded-[22px] bg-white/10 px-4 py-3"><p className="text-xs text-white/55">所属家医网络</p><p className="mt-1 text-sm font-semibold">{home?.network?.name ?? "家医团队正在核验绑定"}</p><p className="mt-1 text-xs text-white/58">{home?.network?.community?.name ?? "暂无社区信息"}</p></div>
          </section>
        ) : null}

        {selectedBinding ? (
          <SectionCard title="常用代办">
            <div className="grid grid-cols-2 gap-3">
              {[{ label: "协助预约", note: "提交家医团队处理", icon: CalendarClock, href: "/appointments" }, { label: "代为提问", note: "整理问题与资料", icon: MessageCircleMore, href: "/ask" }, { label: "查看进度", note: "预约与转诊状态", icon: ClipboardList, href: "/appointments" }, { label: "健康记录", note: "查看授权范围内记录", icon: HeartPulse, href: "/health-records" }].map((item) => <button key={item.label} type="button" onClick={() => router.push(item.href)} className="rounded-[24px] border border-line bg-surface-card p-4 text-left"><item.icon className="h-5 w-5 text-sage" /><span className="mt-3 block text-sm font-semibold text-navy">{item.label}</span><span className="mt-1 block text-xs leading-5 text-navy/48">{item.note}</span></button>)}
            </div>
          </SectionCard>
        ) : null}

        {home?.serviceRequests.length ? (
          <SectionCard title="最近服务">
            <div className="space-y-3">{home.serviceRequests.map((request) => <button key={request.id} type="button" onClick={() => router.push(`/appointments?id=${request.id}`)} className="flex w-full items-center gap-3 rounded-[24px] bg-surface-card p-4 text-left"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-health-soft text-sage"><Stethoscope className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-navy">{request.title}</p><p className="mt-1 text-xs text-navy/48">{serviceStatusLabels[request.status as ServiceStatus] ?? request.status} · {new Date(request.updated_at).toLocaleDateString("zh-CN")}</p></div><ChevronRight className="h-4 w-4 text-navy/28" /></button>)}</div>
          </SectionCard>
        ) : null}

        {home?.notifications.length ? (
          <SectionCard title="团队消息">
            <button type="button" onClick={() => router.push("/messages")} className="flex w-full items-start gap-3 rounded-[24px] bg-health-soft p-4 text-left"><Bell className="mt-0.5 h-5 w-5 text-sage" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-navy">{home.notifications[0].title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-navy/55">{home.notifications[0].content}</p></div><ChevronRight className="mt-1 h-4 w-4 text-navy/28" /></button>
          </SectionCard>
        ) : null}
      </div>
    </PhoneShell>
  );
}

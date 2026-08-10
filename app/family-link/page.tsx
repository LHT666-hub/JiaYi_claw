"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, RefreshCw, ShieldCheck, UserRoundPlus, Users } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";

type Binding = {
  id: string;
  residentName: string;
  familyName: string;
  relationship: string;
  status: "pending" | "active" | "disabled";
  isPrimary: boolean;
};

type FamilyLinkData = { role: "resident" | "family" | "admin"; bindings: Binding[] };

export default function FamilyLinkPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [data, setData] = useState<FamilyLinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [relationship, setRelationship] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/family-links", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "家属关系加载失败");
      setData(payload.data);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "家属关系加载失败。", "warning");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCode() {
    setSaving(true);
    try {
      const response = await fetch("/api/v1/family-links", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "授权码生成失败");
      setCode(payload.data.code);
      setExpiresAt(payload.data.expiresAt);
      showToast("新的家属授权码已生成。", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "授权码生成失败。", "warning");
    } finally {
      setSaving(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showToast("授权码已复制。", "success");
    } catch {
      showToast(`请记录授权码：${code}`, "warning");
    }
  }

  async function redeemCode() {
    setSaving(true);
    try {
      const response = await fetch("/api/v1/family-links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, relationship }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "绑定失败");
      showToast("已成功绑定居民。", "success");
      setCode("");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "绑定失败。", "warning");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="家属协助" subtitle="由居民本人授权，建立可撤销的代办关系" />

        {loading ? <SectionCard><div className="py-10 text-center text-sm text-navy/52">正在读取家属关系</div></SectionCard> : null}

        {!loading && data?.role === "resident" ? (
          <SectionCard>
            <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-health-soft text-sage"><UserRoundPlus className="h-5 w-5" /></div><div><h1 className="font-semibold text-navy">邀请家属协助</h1><p className="mt-1 text-xs text-navy/52">授权码 15 分钟有效，使用一次后自动失效</p></div></div>
            {code ? <button type="button" onClick={() => void copyCode()} className="mt-5 w-full rounded-[26px] border border-sage/40 bg-health-soft px-4 py-6 text-center"><span className="block font-brand text-[32px] font-semibold tracking-[0.18em] text-navy">{code}</span><span className="mt-2 block text-xs text-sage">点击复制，发送给已注册的家属</span>{expiresAt ? <span className="mt-1 block text-[11px] text-navy/42">{new Date(expiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 前有效</span> : null}</button> : <div className="mt-5 rounded-[24px] bg-surface-tint p-4 text-sm leading-6 text-navy/62">生成授权码代表您同意该家属在绑定后，在授权范围内代为查看进度和提交服务申请。</div>}
            <button type="button" disabled={saving} onClick={() => void createCode()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{code ? <RefreshCw className="h-4 w-4" /> : <UserRoundPlus className="h-4 w-4" />}{saving ? "正在生成" : code ? "重新生成" : "生成家属授权码"}</button>
          </SectionCard>
        ) : null}

        {!loading && data?.role === "family" ? (
          <SectionCard>
            <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-health-soft text-sage"><Users className="h-5 w-5" /></div><div><h1 className="font-semibold text-navy">绑定要协助的家人</h1><p className="mt-1 text-xs text-navy/52">请向居民本人获取 8 位一次性授权码</p></div></div>
            <label className="mt-5 block"><span className="text-sm font-semibold text-navy">授权码</span><input value={code} maxLength={8} autoCapitalize="characters" onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, ""))} placeholder="8 位授权码" className="mt-2 h-14 w-full rounded-[20px] border border-line bg-surface-input px-4 text-center text-xl font-semibold tracking-[0.16em] text-navy outline-none focus:border-sage" /></label>
            <label className="mt-4 block"><span className="text-sm font-semibold text-navy">您与居民的关系</span><input value={relationship} maxLength={20} onChange={(event) => setRelationship(event.target.value)} placeholder="例如：女儿、儿子、配偶" className="mt-2 h-[54px] w-full rounded-[20px] border border-line bg-surface-input px-4 text-base text-navy outline-none focus:border-sage" /></label>
            <button type="button" disabled={saving || code.length !== 8 || !relationship.trim()} onClick={() => void redeemCode()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-45"><ShieldCheck className="h-4 w-4" />{saving ? "正在绑定" : "确认绑定"}</button>
          </SectionCard>
        ) : null}

        {!loading && data?.bindings.length ? (
          <SectionCard title="已绑定家人" subtitle="只展示已授权的家属关系">
            <div className="space-y-3">{data.bindings.map((binding) => <div key={binding.id} className="flex items-center gap-3 rounded-[24px] bg-surface-card p-4"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-health-soft text-success"><CheckCircle2 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-navy">{data.role === "family" ? binding.residentName : binding.familyName}</p><p className="mt-1 text-xs text-navy/52">{binding.relationship} · {binding.status === "active" ? "已授权" : "待核验"}</p></div>{data.role === "family" && binding.status === "active" ? <button type="button" onClick={() => router.push("/family")} className="flex items-center gap-1 rounded-full bg-navy px-3 py-2 text-xs font-semibold text-white">进入<ChevronRight className="h-3.5 w-3.5" /></button> : null}</div>)}</div>
          </SectionCard>
        ) : null}

        {!loading && data && !data.bindings.length ? <div className="rounded-[24px] bg-surface-tint px-4 py-3 text-center text-xs leading-5 text-navy/52">尚未建立家属关系。绑定前，家属无法查看居民健康资料或服务进度。</div> : null}
      </div>
    </PhoneShell>
  );
}

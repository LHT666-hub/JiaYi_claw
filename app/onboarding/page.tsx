"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Check,
  ChevronLeft,
  ChevronRight,
  HeartHandshake,
  Home,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { useToast } from "@/components/ToastProvider";
import { CONSENT_COPY } from "@/lib/policies";
import type { AppRole } from "@/lib/types";

type Community = {
  id: string;
  name: string;
  district: string | null;
  address: string | null;
  service_phone: string | null;
};

type OnboardingPayload = {
  profile: {
    display_name: string;
    role: AppRole;
    community_id: string | null;
    onboarding_completed_at: string | null;
  };
  communities: Community[];
  consents: Array<{ scope: string; granted: boolean; policy_version: string }>;
  policyVersion: string;
};

type ConsentKey = keyof typeof CONSENT_COPY;

const initialConsents: Record<ConsentKey, boolean> = {
  privacy: false,
  sensitive_health: false,
  ai_processing: false,
  notification: true,
};

const steps = ["身份", "服务社区", "授权"] as const;

function getHomePath(role: AppRole) {
  if (role === "family") return "/family";
  if (role === "admin") return "/admin";
  if (["doctor", "nurse", "pharmacist", "community"].includes(role)) return "/doctor";
  return "/";
}

export default function OnboardingPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"resident" | "family">("resident");
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communityId, setCommunityId] = useState("");
  const [consents, setConsents] = useState(initialConsents);
  const [privacyConfirmedAtLogin, setPrivacyConfirmedAtLogin] = useState(false);
  const selectedCommunity = useMemo(
    () => communities.find((community) => community.id === communityId) ?? null,
    [communities, communityId],
  );

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/v1/onboarding", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "首次建档加载失败");
        const data = payload.data as OnboardingPayload;
        if (!active) return;
        if (data.profile.onboarding_completed_at) {
          router.replace(getHomePath(data.profile.role));
          return;
        }
        setDisplayName(data.profile.display_name === "新用户" ? "" : data.profile.display_name);
        setRole(data.profile.role === "family" ? "family" : "resident");
        setCommunities(data.communities);
        setCommunityId(data.profile.community_id ?? data.communities[0]?.id ?? "");
        const privacyGranted = (data.consents ?? []).some((item) => item.scope === "privacy" && item.granted);
        setPrivacyConfirmedAtLogin(privacyGranted);
        setConsents((current) => ({ ...current, privacy: privacyGranted }));
      } catch (error) {
        showToast(error instanceof Error ? error.message : "首次建档加载失败。", "warning");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [router, showToast]);

  function continueNext() {
    if (step === 0 && displayName.trim().length < 2) {
      showToast("请填写至少 2 个字的称呼。", "warning");
      return;
    }
    if (step === 1 && !communityId) {
      showToast("请选择当前居住或签约服务社区。", "warning");
      return;
    }
    setStep((current) => Math.min(current + 1, 2));
  }

  async function complete() {
    if (!consents.privacy) {
      showToast("请先同意隐私政策与账号服务。", "warning");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/v1/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, role, communityId, consents }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "首次建档保存失败");
      showToast("资料已保存，欢迎使用家医 Claw。", "success");
      router.replace(payload.data.nextPath);
      router.refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "首次建档保存失败。", "warning");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PhoneShell>
      <main className="min-h-full px-5 pb-10 pt-8">
        <header className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-sage">首次使用</p>
              <h1 className="mt-2 font-brand text-[28px] font-semibold leading-tight text-navy">建立您的<br />家医服务档案</h1>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy text-white shadow-[0_14px_28px_rgba(16,42,67,0.2)]">
              <HeartHandshake className="h-6 w-6" />
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-navy/60">只需完成一次。资料用于匹配所属社区与家医服务，后续均可在“我的”中查看。</p>
        </header>

        <div className="ios-control mt-5 flex items-center rounded-full p-1.5">
          {steps.map((label, index) => (
            <div key={label} className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs font-semibold ${index === step ? "bg-navy text-white shadow-[0_8px_18px_rgba(16,42,67,0.16)]" : index < step ? "text-success" : "text-navy/42"}`}>
              {index < step ? <Check className="h-3.5 w-3.5" /> : <span>{index + 1}</span>}
              <span>{label}</span>
            </div>
          ))}
        </div>

        {loading ? (
          <section className="ios-material mt-5 flex min-h-[330px] items-center justify-center rounded-[30px]">
            <div className="text-center text-navy/55"><LoaderCircle className="mx-auto h-7 w-7 animate-spin" /><p className="mt-3 text-sm">正在准备建档信息</p></div>
          </section>
        ) : null}

        {!loading && step === 0 ? (
          <section className="ios-material mt-5 rounded-[30px] p-5">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-health-soft text-sage"><UserRound className="h-5 w-5" /></div><div><h2 className="font-semibold text-navy">您以什么身份使用？</h2><p className="mt-1 text-xs text-navy/52">工作人员账号由机构单独邀请</p></div></div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {([
                { value: "resident", label: "居民本人", note: "办理本人服务", icon: Home },
                { value: "family", label: "家属代办", note: "协助家人办理", icon: UsersRound },
              ] as const).map((option) => {
                const Icon = option.icon;
                const selected = role === option.value;
                return <button key={option.value} type="button" onClick={() => setRole(option.value)} className={`min-h-[116px] rounded-[24px] border p-4 text-left transition active:scale-[0.98] ${selected ? "border-navy bg-navy text-white shadow-[0_14px_30px_rgba(16,42,67,0.18)]" : "border-line bg-surface-card text-navy"}`}><Icon className={`h-6 w-6 ${selected ? "text-white" : "text-sage"}`} /><span className="mt-4 block text-sm font-semibold">{option.label}</span><span className={`mt-1 block text-xs ${selected ? "text-white/65" : "text-navy/50"}`}>{option.note}</span></button>;
              })}
            </div>
            <label className="mt-5 block"><span className="text-sm font-semibold text-navy">怎么称呼您</span><input value={displayName} maxLength={40} onChange={(event) => setDisplayName(event.target.value)} placeholder={role === "resident" ? "例如：张阿姨" : "例如：小王（张阿姨女儿）"} className="mt-2 h-[54px] w-full rounded-[20px] border border-line bg-surface-input px-4 text-base text-navy outline-none transition focus:border-sage" /></label>
          </section>
        ) : null}

        {!loading && step === 1 ? (
          <section className="ios-material mt-5 rounded-[30px] p-5">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-health-soft text-sage"><MapPin className="h-5 w-5" /></div><div><h2 className="font-semibold text-navy">选择服务社区</h2><p className="mt-1 text-xs text-navy/52">决定您看到的家医团队、排班和转诊网络</p></div></div>
            <div className="mt-5 space-y-3">
              {communities.length ? communities.map((community) => {
                const selected = community.id === communityId;
                return <button key={community.id} type="button" onClick={() => setCommunityId(community.id)} className={`flex w-full items-start gap-3 rounded-[24px] border p-4 text-left transition ${selected ? "border-sage bg-health-soft shadow-[0_12px_26px_rgba(47,108,86,0.1)]" : "border-line bg-surface-card"}`}><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${selected ? "bg-sage text-white" : "bg-surface-icon text-navy/55"}`}>{selected ? <Check className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}</span><span className="min-w-0"><span className="block text-sm font-semibold text-navy">{community.name}</span><span className="mt-1 block text-xs leading-5 text-navy/52">{community.district || community.address || "服务范围由机构核验"}</span>{community.service_phone ? <span className="mt-1 block text-xs text-sage">服务电话 {community.service_phone}</span> : null}</span></button>;
              }) : <div className="rounded-[24px] bg-risk-soft p-5 text-sm leading-6 text-danger">当前暂无开放社区，请联系试点机构管理员。</div>}
            </div>
            {selectedCommunity ? <div className="mt-4 rounded-[22px] bg-health-soft px-4 py-3 text-xs leading-5 text-navy/62">后续可由工作人员核验签约关系；选择社区不会自动完成医疗签约。</div> : null}
          </section>
        ) : null}

        {!loading && step === 2 ? (
          <section className="ios-material mt-5 rounded-[30px] p-5">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-health-soft text-sage"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="font-semibold text-navy">确认授权范围</h2><p className="mt-1 text-xs text-navy/52">每项单独记录，可在“我的”中撤回</p></div></div>
            <div className="mt-5 space-y-3">
              {(Object.entries(CONSENT_COPY) as [ConsentKey, (typeof CONSENT_COPY)[ConsentKey]][]).map(([key, copy]) => {
                const Icon = key === "notification" ? BellRing : key === "ai_processing" ? Sparkles : ShieldCheck;
                const confirmedAtLogin = key === "privacy" && privacyConfirmedAtLogin;
                return <label key={key} className={`flex items-start gap-3 rounded-[24px] border p-4 transition ${confirmedAtLogin ? "cursor-default" : "cursor-pointer"} ${consents[key] ? "border-sage/55 bg-health-soft" : "border-line bg-surface-card"}`}><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${consents[key] ? "bg-sage text-white" : "bg-surface-icon text-navy/50"}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy">{copy.title}{confirmedAtLogin ? <span className="rounded-full bg-sage px-2 py-0.5 text-[10px] text-white">登录时已确认</span> : copy.required ? <span className="rounded-full bg-navy px-2 py-0.5 text-[10px] text-white">必需</span> : null}</span><span className="mt-1.5 block text-xs leading-5 text-navy/56">{copy.description}</span></span><input type="checkbox" checked={consents[key]} disabled={confirmedAtLogin} onChange={(event) => setConsents((current) => ({ ...current, [key]: event.target.checked }))} className="mt-2 h-5 w-5 accent-[#6F9996]" /></label>;
              })}
            </div>
            <p className="mt-4 text-center text-xs leading-5 text-navy/48">完整政策可在“我的 - 隐私与授权”查看。紧急情况请拨打 120。</p>
          </section>
        ) : null}

        {!loading ? (
          <div className="mt-5 flex gap-3">
            {step > 0 ? <button type="button" onClick={() => setStep((current) => current - 1)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-surface-card text-navy"><ChevronLeft className="h-5 w-5" /></button> : null}
            {step < 2 ? <button type="button" onClick={continueNext} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(16,42,67,0.18)]">继续<ChevronRight className="h-4 w-4" /></button> : <button type="button" disabled={saving || !consents.privacy} onClick={() => void complete()} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(16,42,67,0.18)] disabled:opacity-45">{saving ? "正在建立档案" : "完成并进入"}{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}</button>}
          </div>
        ) : null}
      </main>
    </PhoneShell>
  );
}

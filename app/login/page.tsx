"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronRight,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { useToast } from "@/components/ToastProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile, getPostLoginPath } from "@/lib/supabase/mvp";

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const devLoginEnabled = process.env.NEXT_PUBLIC_DEV_LOGIN === "true";
  const [mode, setMode] = useState<"phone" | "staff">("phone");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(value - 1, 0)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  async function enterDevelopmentSession(role: "resident" | "family" | "doctor" | "admin") {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/auth/dev-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "本地账号进入失败");
      const profile = payload.data.profile;
      router.replace(getPostLoginPath(profile.role, profile.onboarding_completed_at));
      router.refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "本地账号进入失败。", "warning");
    } finally {
      setLoading(false);
    }
  }

  async function requestOtp() {
    if (!accepted) {
      showToast("请先阅读并同意隐私政策与用户协议。", "warning");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/v1/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "验证码发送失败");
      setStep("otp");
      setCountdown(payload.data.retryAfterSeconds ?? 60);
      showToast(`验证码已发送到 ${payload.data.phone}`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "验证码发送失败。", "warning");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, token: otp }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "验证码验证失败");
      showToast("手机号验证成功。", "success");
      router.replace(payload.data.needsOnboarding ? "/onboarding" : getPostLoginPath(payload.data.profile?.role, payload.data.profile?.onboarding_completed_at));
      router.refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "验证码验证失败。", "warning");
    } finally {
      setLoading(false);
    }
  }

  async function handleAccountLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return showToast("账号服务尚未配置。", "warning");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      return showToast("账号或密码不正确。", "warning");
    }
    const profile = await fetchCurrentProfile(supabase);
    setLoading(false);
    if (!profile) return showToast("人员档案暂时无法读取。", "warning");
    router.replace(getPostLoginPath(profile.role, profile.onboarding_completed_at));
    router.refresh();
  }

  return (
    <PhoneShell>
      <main className="min-h-full px-5 pb-10 pt-8">
        <header className="py-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-navy text-white shadow-[0_16px_34px_rgba(16,42,67,0.22)]">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <p className="mt-4 font-brand text-3xl font-semibold text-navy">家医 Claw</p>
          <p className="mt-2 text-sm leading-6 text-navy/58">海湾镇家医服务与分级诊疗协同入口</p>
        </header>

        <div className="ios-control grid grid-cols-2 gap-1 rounded-[26px] p-1.5">
          <button type="button" onClick={() => setMode("phone")} className={`rounded-[20px] px-3 py-2.5 text-sm font-semibold ${mode === "phone" ? "bg-navy text-white shadow-[0_10px_24px_rgba(16,42,67,0.18)]" : "text-navy/60"}`}>居民与家属</button>
          <button type="button" onClick={() => setMode("staff")} className={`rounded-[20px] px-3 py-2.5 text-sm font-semibold ${mode === "staff" ? "bg-navy text-white shadow-[0_10px_24px_rgba(16,42,67,0.18)]" : "text-navy/60"}`}>工作人员</button>
        </div>

        {mode === "phone" ? (
          <section className="ios-material mt-5 rounded-[30px] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-health-soft text-sage"><Phone className="h-5 w-5" /></div>
              <div><h1 className="text-lg font-semibold text-navy">{step === "phone" ? "手机号登录" : "输入验证码"}</h1><p className="mt-1 text-xs text-navy/55">新用户验证后再完成身份与服务社区建档</p></div>
            </div>

            {step === "phone" ? (
              <div className="mt-5 space-y-4">
                <label className="block"><span className="text-sm font-semibold text-navy">手机号</span><div className="mt-2 flex h-[54px] items-center rounded-[20px] border border-line bg-surface-input px-4 transition focus-within:border-sage"><span className="mr-3 border-r border-line pr-3 text-sm font-semibold text-navy">+86</span><input inputMode="tel" autoComplete="tel" value={phone} maxLength={11} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))} placeholder="请输入中国大陆手机号" className="min-w-0 flex-1 bg-transparent text-base text-navy outline-none" /></div></label>
                <label className="flex cursor-pointer items-start gap-3 rounded-[22px] bg-health-soft p-4 text-xs leading-5 text-navy/66"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#6F9996]" /><span>我已阅读并同意 <Link href="/legal/privacy-policy" className="font-semibold text-sage underline decoration-sage/35 underline-offset-2">隐私政策</Link> 与 <Link href="/legal/user-agreement" className="font-semibold text-sage underline decoration-sage/35 underline-offset-2">用户协议</Link>。健康信息、AI 整理和通知授权将在登录后分别确认。</span></label>
                <button type="button" disabled={loading || phone.length !== 11} onClick={() => void requestOtp()} className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(16,42,67,0.18)] disabled:opacity-45">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{loading ? "正在发送" : "获取验证码"}<ChevronRight className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-[22px] bg-health-soft px-4 py-3 text-sm leading-6 text-navy/68">验证码已发送，请在有效期内完成验证。验证码仅用于登录，请勿转发。</div>
                <label className="block"><span className="text-sm font-semibold text-navy">短信验证码</span><input inputMode="numeric" autoComplete="one-time-code" value={otp} maxLength={10} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} placeholder="6 位验证码" className="mt-2 h-14 w-full rounded-[20px] border border-line bg-surface-input px-4 text-center text-2xl tracking-[0.3em] text-navy outline-none transition focus:border-sage" /></label>
                <button type="button" disabled={loading || otp.length < 6} onClick={() => void verifyOtp()} className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(16,42,67,0.18)] disabled:opacity-45">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{loading ? "正在验证" : "验证并继续"}</button>
                <div className="flex items-center justify-between px-1 text-sm"><button type="button" onClick={() => { setStep("phone"); setOtp(""); }} className="font-semibold text-sage">修改手机号</button><button type="button" disabled={countdown > 0 || loading} onClick={() => void requestOtp()} className="font-semibold text-navy/58 disabled:text-navy/30">{countdown > 0 ? `${countdown} 秒后重发` : "重新发送"}</button></div>
              </div>
            )}
          </section>
        ) : (
          <section className="ios-material mt-5 rounded-[30px] p-5">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-health-soft text-sage"><KeyRound className="h-5 w-5" /></div><div><h1 className="text-lg font-semibold text-navy">工作人员登录</h1><p className="mt-1 text-xs text-navy/55">医生、护士和管理员账号由机构邀请开通</p></div></div>
            <form onSubmit={handleAccountLogin} className="mt-5 space-y-4">
              <label className="block"><span className="text-sm font-semibold text-navy">工作邮箱</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@institution.cn" className="mt-2 h-[54px] w-full rounded-[20px] border border-line bg-surface-input px-4 text-base outline-none focus:border-sage" /></label>
              <label className="block"><span className="text-sm font-semibold text-navy">密码</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" className="mt-2 h-[54px] w-full rounded-[20px] border border-line bg-surface-input px-4 text-base outline-none focus:border-sage" /></label>
              <button disabled={loading || !email || !password} className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(16,42,67,0.18)] disabled:opacity-45"><LockKeyhole className="h-4 w-4" />{loading ? "正在登录" : "进入工作台"}</button>
            </form>
            <p className="mt-4 text-center text-xs leading-5 text-navy/48">没有账号请联系机构管理员，公开注册不能获得工作人员权限。</p>
          </section>
        )}

        {devLoginEnabled ? (
          <section className="mt-5 rounded-[28px] border border-dashed border-sage/45 bg-health-soft/75 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-navy"><LogIn className="h-4 w-4 text-sage" />本地开发入口</p>
            <button type="button" disabled={loading} onClick={() => void enterDevelopmentSession("resident")} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">居民账号进入<ChevronRight className="h-4 w-4" /></button>
            <div className="mt-2 grid grid-cols-3 gap-2">{([['family', '家属'], ['doctor', '医生'], ['admin', '管理']] as const).map(([role, label]) => <button key={role} type="button" disabled={loading} onClick={() => void enterDevelopmentSession(role)} className="rounded-full border border-line bg-surface-card px-2 py-2 text-xs font-semibold text-navy disabled:opacity-50">{label}</button>)}</div>
          </section>
        ) : null}

        <footer className="mt-6 flex items-center justify-center gap-2 text-xs text-navy/42"><ShieldCheck className="h-3.5 w-3.5" />仅提供服务导航、资料整理和人工协同</footer>
      </main>
    </PhoneShell>
  );
}

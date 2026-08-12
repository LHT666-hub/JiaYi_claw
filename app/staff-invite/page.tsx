"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, ChevronLeft, ShieldCheck } from "lucide-react";
import { PhoneOtpCard } from "@/components/auth/PhoneOtpCard";
import { useAuthCapabilities } from "@/components/auth/useAuthCapabilities";
import { useToast } from "@/components/ToastProvider";

export default function StaffInvitePage() {
  const router = useRouter(); const { showToast } = useToast(); const { capabilities, failed, loading, retry } = useAuthCapabilities();
  const [token, setToken] = useState(""); const [accepting, setAccepting] = useState(false); const [accepted, setAccepted] = useState(false);
  useEffect(() => { const value = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? ""; setToken(value); }, []);
  async function acceptInvite() {
    if (!token) return showToast("邀请链接不完整，请联系机构管理员重新发送。", "warning");
    setAccepting(true);
    try {
      const response = await fetch("/api/v1/staff-invites/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "邀请接受失败。");
      window.history.replaceState(null, "", "/staff-invite"); setAccepted(true); showToast("工作人员身份已开通。", "success");
      window.setTimeout(() => { router.replace(payload.data.profile?.role === "admin" ? "/admin" : "/doctor"); router.refresh(); }, 900);
    } catch (reason) { showToast(reason instanceof Error ? reason.message : "邀请接受失败。", "warning"); }
    finally { setAccepting(false); }
  }
  return <main className="min-h-screen bg-[#edf1ef] px-4 py-8 sm:py-12"><section className="mx-auto w-full max-w-[460px]"><Link href="/staff/login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy/58"><ChevronLeft className="h-4 w-4" />返回工作人员登录</Link><header className="mb-7 mt-10"><div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-navy text-white shadow-[0_14px_28px_rgba(16,42,67,0.18)]"><Building2 className="h-6 w-6" /></div><p className="mt-5 text-xs font-semibold text-sage">机构人员邀请</p><h1 className="mt-2 text-3xl font-semibold text-navy">验证本人手机号</h1><p className="mt-2 text-sm leading-6 text-navy/55">验证手机号与管理员登记一致后，系统才会开通对应工作台角色。</p></header>{accepted ? <div className="rounded-[30px] bg-white p-7 text-center shadow-sm"><CheckCircle2 className="mx-auto h-10 w-10 text-sage" /><p className="mt-4 font-semibold">身份已开通</p><p className="mt-2 text-sm text-navy/50">正在进入机构工作台。</p></div> : token ? <PhoneOtpCard audience="staff" requestEndpoint="/api/v1/auth/otp/request" verifyEndpoint="/api/v1/auth/otp/verify" title="受邀手机号验证" subtitle={accepting ? "正在开通工作人员身份" : "请输入管理员邀请时登记的手机号"} availability={loading ? "checking" : capabilities?.sms.available ? "available" : "unavailable"} unavailableMessage={failed ? "暂时无法核验短信通道。" : capabilities?.sms.unavailableMessage} onRetryAvailability={retry} contextToken={token} onVerified={() => void acceptInvite()} /> : <div className="rounded-[30px] border border-danger/15 bg-white p-6"><p className="font-semibold text-danger">邀请链接不完整</p><p className="mt-2 text-sm leading-6 text-navy/55">请联系机构管理员重新生成邀请链接。</p></div>}<div className="mt-5 flex items-start gap-3 rounded-[22px] border border-white/70 bg-white/60 px-4 py-3 text-xs leading-5 text-navy/52"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sage" />链接只能由受邀手机号使用，验证成功后立即失效。</div></section></main>;
}

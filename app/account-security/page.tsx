"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, ShieldAlert, Trash2, Undo2 } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { useToast } from "@/components/ToastProvider";

type DeletionRequest = { id: string; status: string; requested_at: string; scheduled_for: string; cancelled_at?: string | null };

export default function AccountSecurityPage() {
  const { showToast } = useToast();
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/v1/account-deletion", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (response.ok) setRequest(payload.data.request);
    }).finally(() => setLoading(false));
  }, []);

  async function act(action: "request" | "cancel") {
    setSaving(true);
    try {
      const response = await fetch("/api/v1/account-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "request" ? { action, reason } : { action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "操作失败");
      setRequest(payload.data.request);
      setConfirmation("");
      showToast(action === "request" ? "注销申请已提交，可在冷静期内撤销。" : "注销申请已撤销。", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败", "warning");
    } finally {
      setSaving(false);
    }
  }

  const pending = request?.status === "pending" || request?.status === "processing";
  return <PhoneShell showBottomNav><main className="space-y-5 px-4 pb-8">
    <BackHeader title="账号与安全" />
    {loading ? <div className="py-16 text-center text-sm text-navy/45">正在读取账号状态...</div> : pending ? <>
      <section className="ios-material rounded-[30px] p-5"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-risk-soft text-danger"><CalendarClock className="h-5 w-5" /></span><div><h1 className="font-semibold text-navy">注销申请处理中</h1><p className="mt-2 text-sm leading-6 text-navy/58">计划处理时间：{new Date(request.scheduled_for).toLocaleString("zh-CN")}</p></div></div><p className="mt-4 rounded-[20px] bg-white/70 p-4 text-xs leading-5 text-navy/58">冷静期内账号仍可正常使用。正式处理后将停用登录、撤回授权并按数据保留规则删除或匿名化个人资料。</p></section>
      {request.status === "pending" ? <button type="button" disabled={saving} onClick={() => void act("cancel")} className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface-card px-4 py-3.5 text-sm font-semibold text-navy disabled:opacity-50"><Undo2 className="h-4 w-4" />撤销注销申请</button> : null}
    </> : <>
      <section className="ios-material rounded-[30px] p-5"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-health-soft text-sage"><CheckCircle2 className="h-5 w-5" /></span><div><h1 className="font-semibold text-navy">账号状态正常</h1><p className="mt-2 text-sm leading-6 text-navy/58">注销不是退出登录。申请后有 7 天冷静期，期间可随时撤销。</p></div></div></section>
      <section className="rounded-[28px] border border-danger/15 bg-risk-soft/60 p-5"><h2 className="flex items-center gap-2 font-semibold text-danger"><ShieldAlert className="h-5 w-5" />注销后会发生什么</h2><div className="mt-3 space-y-2 text-sm leading-6 text-navy/62"><p>停止手机号和微信登录。</p><p>撤回敏感健康信息、家属代办及通知授权。</p><p>删除可直接识别身份的资料；依法或为安全审计必须保留的记录会去标识化。</p><p>正在处理的预约或转诊请先与家医团队确认。</p></div></section>
      <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} placeholder="注销原因（选填）" className="w-full resize-none rounded-[22px] border border-line bg-surface-card p-4 text-sm outline-none focus:border-sage" />
      <div className="rounded-[24px] border border-line bg-surface-card p-4"><label className="text-xs font-semibold text-navy/55" htmlFor="deletion-confirmation">请输入“确认注销”</label><input id="deletion-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 h-12 w-full rounded-[18px] border border-line bg-cream px-4 text-sm outline-none focus:border-sage" /></div>
      <button type="button" disabled={saving || confirmation !== "确认注销"} onClick={() => void act("request")} className="flex w-full items-center justify-center gap-2 rounded-full bg-danger px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-35"><Trash2 className="h-4 w-4" />提交账号注销申请</button>
    </>}
  </main></PhoneShell>;
}

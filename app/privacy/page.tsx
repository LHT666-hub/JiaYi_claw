"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { CareSubjectSwitcher } from "@/components/CareSubjectSwitcher";
import { PhoneShell } from "@/components/PhoneShell";
import { useToast } from "@/components/ToastProvider";
import { CURRENT_POLICY_VERSION } from "@/lib/policies";

const scopes = [
  {
    id: "privacy",
    title: "基础隐私政策",
    description: "账号、联系方式和服务记录的必要处理。",
  },
  {
    id: "sensitive_health",
    title: "敏感健康信息",
    description: "健康指标、用药和居民主动提交的健康情况。",
  },
  {
    id: "ai_processing",
    title: "AI 辅助整理",
    description: "仅用于信息分类、公开信息检索和接诊前摘要。",
  },
  {
    id: "notification",
    title: "服务通知",
    description: "预约进度、补充资料和处理结果提醒。",
  },
] as const;

export default function PrivacyPage() {
  const { showToast } = useToast();
  const [grants, setGrants] = useState<Record<string, boolean>>({});
  const [residentId, setResidentId] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/v1/consents", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      const next: Record<string, boolean> = {};
      for (const item of payload.data.consents ?? [])
        if (!(item.scope in next)) next[item.scope] = item.granted;
      setResidentId(payload.data.residentId ?? "");
      setGrants(next);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function toggle(scope: string, granted: boolean) {
    const response = await fetch("/api/v1/consents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        residentId: residentId || undefined,
        scope,
        policyVersion: CURRENT_POLICY_VERSION,
        granted,
      }),
    });
    const payload = await response.json();
    if (!response.ok)
      return showToast(
        payload.error?.message ?? "授权状态保存失败。",
        "warning",
      );
    setGrants((current) => ({ ...current, [scope]: granted }));
    showToast(granted ? "已授权。" : "已撤回授权。", "success");
  }
  return (
    <PhoneShell showBottomNav>
      <main className="space-y-5 px-4 pb-8">
        <BackHeader
          title="隐私与授权"
          subtitle="您可以随时查看和撤回非必要授权。"
        />
        <CareSubjectSwitcher compact />
        <div className="rounded-[26px] border border-line bg-health-soft p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <ShieldCheck className="h-5 w-5 text-sage" />
            医疗健康信息属于敏感个人信息
          </p>
          <p className="mt-2 text-xs leading-5 text-navy/60">
            当前设置仅作用于上方服务对象。撤回授权不会删除依法需要保留的审计记录，但会阻止后续相应处理。AI
            不替代医生提供诊疗服务。
          </p>
        </div>
        <div className="divide-y divide-line overflow-hidden rounded-[30px] border border-line bg-surface-card shadow-[0_16px_38px_rgba(16,42,67,0.06)]">
          {scopes.map((scope) => (
            <div key={scope.id} className="flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-navy">
                  {scope.title}
                </h2>
                <p className="mt-1 text-xs leading-5 text-navy/55">
                  {scope.description}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(grants[scope.id])}
                disabled={!residentId}
                onClick={() => void toggle(scope.id, !grants[scope.id])}
                className={`relative h-7 w-12 rounded-full transition disabled:opacity-40 ${grants[scope.id] ? "bg-success" : "bg-navy/20"}`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${grants[scope.id] ? "left-6" : "left-1"}`}
                />
              </button>
            </div>
          ))}
        </div>
      </main>
    </PhoneShell>
  );
}

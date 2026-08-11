"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Clock3,
  RefreshCw,
} from "lucide-react";
import type {
  ReadinessCheck,
  ReadinessStatus,
} from "@/lib/operations/readiness";

type ReadinessPayload = {
  checks: ReadinessCheck[];
  summary: { ready: number; pending: number; blocked: number; total: number };
};

const statusMeta: Record<ReadinessStatus, { label: string; className: string }> = {
  ready: { label: "可用", className: "bg-health-soft text-success" },
  pending: { label: "待完善", className: "bg-[#F6EDDD] text-amber" },
  blocked: { label: "阻断", className: "bg-risk-soft text-danger" },
};

export default function AdminReadinessPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<ReadinessPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/v1/admin/readiness", { cache: "no-store" });
      const body = await response.json();
      if (response.status === 401 || response.status === 403) {
        router.replace("/staff/login");
        return;
      }
      if (!response.ok) throw new Error(body.error?.message ?? "上线准备度读取失败");
      setPayload(body.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上线准备度读取失败");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="min-h-dvh bg-[#F3F5F4] text-navy">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/admin" aria-label="返回管理后台" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-white">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-sage">正式环境诊断</p>
              <h1 className="mt-1 text-xl font-semibold">上线准备度</h1>
              <p className="mt-1 text-xs text-navy/48">只显示配置状态，不读取或展示密钥值</p>
            </div>
          </div>
          <button type="button" disabled={loading} onClick={() => void load()} className="flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            重新检测
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6">
        {error ? <div className="border border-danger/20 bg-risk-soft p-4 text-sm text-danger">{error}</div> : null}
        {payload ? (
          <>
            <section className="grid grid-cols-2 border border-line bg-white md:grid-cols-4">
              <Metric label="检查项" value={payload.summary.total} icon={<Clock3 className="h-4 w-4" />} />
              <Metric label="可用" value={payload.summary.ready} icon={<CheckCircle2 className="h-4 w-4 text-success" />} />
              <Metric label="待完善" value={payload.summary.pending} icon={<Clock3 className="h-4 w-4 text-amber" />} />
              <Metric label="阻断" value={payload.summary.blocked} icon={<CircleAlert className="h-4 w-4 text-danger" />} />
            </section>

            <section className="mt-5 overflow-hidden border border-line bg-white">
              <div className="grid grid-cols-[minmax(150px,0.8fr)_minmax(240px,1.5fr)_110px] border-b border-line bg-[#EEF2F0] px-4 py-3 text-xs font-semibold text-navy/55">
                <span>能力</span><span>检测结果与下一步</span><span>状态</span>
              </div>
              <div className="divide-y divide-line">
                {payload.checks.map((check) => {
                  const meta = statusMeta[check.status];
                  return (
                    <div key={check.id} className="grid grid-cols-1 gap-2 px-4 py-4 md:grid-cols-[minmax(150px,0.8fr)_minmax(240px,1.5fr)_110px] md:items-start md:gap-4">
                      <p className="font-semibold">{check.label}</p>
                      <div className="text-sm leading-6 text-navy/58">
                        <p>{check.detail}</p>
                        {check.action ? <p className="mt-1 font-medium text-navy/78">下一步：{check.action}</p> : null}
                      </div>
                      <span className={`w-fit rounded px-2.5 py-1 text-xs font-semibold ${meta.className}`}>{meta.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <p className="mt-4 text-xs leading-5 text-navy/45">阻断项未清零前，系统可以用于本地与合成数据验收，但不能承载真实居民健康数据或提交微信正式审核。</p>
          </>
        ) : loading ? <div className="h-72 animate-pulse border border-line bg-white" /> : null}
      </div>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <div className="border-b border-line p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"><div className="flex items-center justify-between text-xs text-navy/48"><span>{label}</span>{icon}</div><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}

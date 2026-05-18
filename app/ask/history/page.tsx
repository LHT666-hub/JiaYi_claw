"use client";

import { useEffect, useState } from "react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { readAskLogs, STORAGE_CHANGE_EVENT } from "@/lib/storage";
import { AskLogItem, RiskLevel } from "@/lib/types";
import { formatMessageTime } from "@/lib/format";

const riskColors: Record<RiskLevel, string> = {
  low: "bg-health-success text-success",
  medium: "bg-[#FFF1DD] text-amber",
  high: "bg-[#F8DDD9] text-danger",
  emergency: "bg-[#F8DDD9] text-danger",
};

const riskLabels: Record<RiskLevel, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
  emergency: "紧急",
};

export default function AskHistoryPage() {
  const [logs, setLogs] = useState<AskLogItem[]>([]);

  useEffect(() => {
    function refresh() {
      setLogs(readAskLogs().slice().reverse());
    }

    refresh();
    window.addEventListener(STORAGE_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="提问记录" subtitle="您之前问过 Claw 的所有问题" />

        {logs.length === 0 ? (
          <SectionCard>
            <div className="rounded-[24px] bg-surface-card p-6 text-center">
              <p className="text-base font-semibold text-navy">还没有提问记录</p>
              <p className="mt-2 text-sm leading-6 text-navy/60">
                有疑问可以先去问 Claw，流程、配药、体检、随访相关的问题都可以。
              </p>
              <a
                href="/ask"
                className="mt-4 inline-block rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white"
              >
                去问 Claw
              </a>
            </div>
          </SectionCard>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <SectionCard key={log.id}>
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-navy">{log.question}</p>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${riskColors[log.riskLevel]}`}
                    >
                      {riskLabels[log.riskLevel]}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-navy/68">
                    {log.answer.length > 120 ? `${log.answer.slice(0, 120)}...` : log.answer}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-navy/45">
                    {log.category ? <span>{log.category}</span> : null}
                    <span>{formatMessageTime(log.createdAt)}</span>
                    {log.suggestDoctor ? (
                      <span className="text-amber">建议联系家医</span>
                    ) : null}
                  </div>
                </div>
              </SectionCard>
            ))}
          </div>
        )}
      </div>
    </PhoneShell>
  );
}

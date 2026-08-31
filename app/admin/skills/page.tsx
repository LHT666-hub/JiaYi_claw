"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import type { SkillDefinition } from "@jiayi/contracts";

type SkillRun = { skill_id: string; status: string; latency_ms: number | null; created_at: string };
type RagStatus = {
  documentCount: number;
  activeCount: number;
  failedDocumentCount: number;
  openJobCount: number;
  embeddingProvider: string;
};

export default function AdminSkillsPage() {
  const router = useRouter();
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [runs, setRuns] = useState<SkillRun[]>([]);
  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null);
  const [processingRag, setProcessingRag] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      fetch("/api/v1/admin/skills", { cache: "no-store" }),
      fetch("/api/v1/admin/rag/status", { cache: "no-store" }),
    ]).then(async ([skillsResponse, ragResponse]) => {
      const [skillsPayload, ragPayload] = await Promise.all([skillsResponse.json(), ragResponse.json()]);
      if (!skillsResponse.ok) setError(skillsPayload.error?.message ?? "读取失败");
      else { setSkills(skillsPayload.data.skills ?? []); setRuns(skillsPayload.data.recentRuns ?? []); }
      if (ragResponse.ok) setRagStatus(ragPayload.data);
    });
  }, []);

  const processRagQueue = async () => {
    setProcessingRag(true);
    setError("");
    try {
      const response = await fetch("/api/v1/admin/rag/index", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "pending", limit: 10 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "索引处理失败");
      const statusResponse = await fetch("/api/v1/admin/rag/status", { cache: "no-store" });
      const statusPayload = await statusResponse.json();
      if (statusResponse.ok) setRagStatus(statusPayload.data);
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "索引处理失败");
    } finally {
      setProcessingRag(false);
    }
  };

  const lastRunBySkill = useMemo(() => new Map(runs.map((run) => [run.skill_id, run])), [runs]);

  return <main className="min-h-screen bg-[#F7F3EC] text-navy">
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4">
        <button onClick={() => router.push("/admin")} aria-label="返回管理后台" className="flex h-10 w-10 items-center justify-center rounded-md border border-line"><ArrowLeft className="h-4 w-4" /></button>
        <div><h1 className="text-xl font-semibold">Agent Skill 管理</h1><p className="mt-1 text-xs text-navy/50">来源、许可证、用途、风险、允许工具和运行评测</p></div>
      </div>
    </header>
    <div className="mx-auto max-w-7xl px-5 py-6">
      {ragStatus ? <section className="mb-5 border border-line bg-white p-5" aria-label="RAG 知识索引状态">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4 text-sage" />机构知识索引</h2><p className="mt-1 text-xs text-navy/50">只索引已审核、未过期资料；居民回答保留片段级来源。</p></div>
          <button type="button" onClick={() => void processRagQueue()} disabled={processingRag || ragStatus.openJobCount === 0} className="inline-flex h-9 items-center gap-2 border border-line bg-white px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45">
            <RefreshCw className={`h-4 w-4 ${processingRag ? "animate-spin" : ""}`} />{processingRag ? "正在处理" : "处理索引队列"}
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-2 border-y border-line sm:grid-cols-5">
          {[
            ["全部文档", ragStatus.documentCount], ["可用文档", ragStatus.activeCount],
            ["待处理任务", ragStatus.openJobCount], ["失败文档", ragStatus.failedDocumentCount],
            ["检索模式", ragStatus.embeddingProvider === "openai-compatible" ? "混合检索" : "关键词"],
          ].map(([label, value]) => <div key={label} className="border-b border-line p-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><dt className="text-[11px] text-navy/45">{label}</dt><dd className="mt-1 text-lg font-semibold">{value}</dd></div>)}
        </dl>
      </section> : null}
      {error ? <p className="border border-danger/20 bg-risk-soft p-4 text-sm text-danger">{error}</p> :
        <div className="overflow-x-auto border border-line bg-white">
          <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
            <thead className="bg-[#F2E9DC] text-xs text-navy/60"><tr><th className="p-3">Skill</th><th className="p-3">解决问题</th><th className="p-3">来源 / 许可</th><th className="p-3">工具</th><th className="p-3">风险</th><th className="p-3">评测 / 最近运行</th></tr></thead>
            <tbody className="divide-y divide-line">{skills.map((skill) => {
              const lastRun = lastRunBySkill.get(skill.id);
              return <tr key={skill.id}>
                <td className="p-3"><p className="font-semibold">{skill.name}</p><p className="mt-1 text-xs text-navy/45">{skill.id} · v{skill.version}</p></td>
                <td className="max-w-[280px] p-3 leading-6">{skill.solves}</td>
                <td className="max-w-[280px] p-3"><p>{skill.source}</p><p className="mt-1 text-xs font-semibold text-sage">{skill.license}</p>{skill.sourceCommit ? <p className="mt-1 font-mono text-[10px] text-navy/40">commit {skill.sourceCommit.slice(0, 12)}</p> : null}</td>
                <td className="p-3 text-xs">{skill.allowedTools.join("、") || "无写工具"}</td>
                <td className="p-3">{skill.risk === "high" ? <span className="inline-flex items-center gap-1 text-danger"><ShieldAlert className="h-4 w-4" />高</span> : skill.risk === "medium" ? "中" : "低"}</td>
                <td className="p-3">{skill.evalScore > 0 ? <span className="inline-flex items-center gap-1 font-semibold text-success"><CheckCircle2 className="h-4 w-4" />{skill.evalScore}%</span> : <span className="text-xs font-semibold text-amber">准确率待真实口音评测</span>}<p className="mt-1 text-xs text-navy/45">{lastRun ? `${lastRun.status} · ${new Date(lastRun.created_at).toLocaleString("zh-CN")}` : "暂无运行记录"}</p></td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
    </div>
  </main>;
}

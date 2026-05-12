"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, ChevronRight, Sparkles, Users } from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import {
  MatchFormData,
  areaOptions,
  chronicTagOptions,
  matchLeaders,
} from "@/lib/matchLeader";
import { appendLocalNotification, appendMatchLog, writeMatchedLeader } from "@/lib/storage";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useDemoUser } from "@/lib/useDemoUser";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | "result";

type UnifiedResult = {
  matchId: string | null;
  leaderId: string;
  leaderName: string;
  leaderArea: string;
  leaderDescription: string;
  leaderStrengths: string[];
  leaderAvatarColor: string;
  leaderBuilding?: string;
  leaderAge?: number;
  score: number;
  matchPercent: number;
  matchReasons: string[];
};

const stepLabels: Record<number, string> = {
  1: "您住在哪个社区？",
  2: "您有哪些慢性病？",
  3: "您是否觉得手机操作有困难？",
  4: "您是否独居或高龄需要关照？",
  5: "您是否需要体检登记协助？",
  6: "您是否愿意参加每日健康打卡？",
  7: "您是否需要防诈骗提醒？",
};

export default function MatchLeaderPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { currentUser } = useDemoUser();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<MatchFormData>({
    area: "",
    chronicTags: [],
    phoneDifficulty: false,
    elderlyAlone: false,
    healthCheckNeed: false,
    checkInWilling: false,
    antiScamNeed: false,
  });
  const [results, setResults] = useState<UnifiedResult[]>([]);

  async function runMatch() {
    if (isSupabaseConfigured()) {
      try {
        const response = await fetch("/api/leaders/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          results?: {
            matchId: string | null;
            leader: {
              id: string;
              name: string;
              area: string | null;
              strengths: string[];
              description: string | null;
              avatarUrl: string | null;
            };
            score: number;
            matchPercent: number;
            reasons: string[];
          }[];
        };

        if (response.ok && payload.ok && payload.results?.length) {
          setResults(
            payload.results.map((item) => ({
              matchId: item.matchId,
              leaderId: item.leader.id,
              leaderName: item.leader.name,
              leaderArea: item.leader.area ?? "",
              leaderDescription: item.leader.description ?? "",
              leaderStrengths: item.leader.strengths,
              leaderAvatarColor: "#5A7A94",
              score: item.score,
              matchPercent: item.matchPercent,
              matchReasons: item.reasons,
            })),
          );
          setStep("result");
          return;
        }
      } catch {
        // Fall back to local matching.
      }
    }

    const localResults = matchLeaders(form);
    setResults(
      localResults.map((item) => ({
        matchId: null,
        leaderId: item.leader.id,
        leaderName: item.leader.name,
        leaderArea: item.leader.area,
        leaderDescription: item.leader.description,
        leaderStrengths: item.leader.strengths,
        leaderAvatarColor: item.leader.avatarColor,
        leaderBuilding: item.leader.building,
        leaderAge: item.leader.age,
        score: item.score,
        matchPercent: item.matchPercent,
        matchReasons: item.matchReasons,
      })),
    );
    setStep("result");
  }

  function goNext() {
    if (step === 7) {
      void runMatch();
      return;
    }

    if (typeof step === "number") {
      setStep((step + 1) as Step);
    }
  }

  function goBack() {
    if (step === "result") {
      setStep(7);
      return;
    }

    if (typeof step === "number" && step > 1) {
      setStep((step - 1) as Step);
      return;
    }

    router.back();
  }

  function toggleChronicTag(tag: string) {
    setForm((prev) => ({
      ...prev,
      chronicTags: prev.chronicTags.includes(tag)
        ? prev.chronicTags.filter((item) => item !== tag)
        : [...prev.chronicTags, tag],
    }));
  }

  async function handleSelectLeader(result: UnifiedResult) {
    writeMatchedLeader({
      leaderId: result.leaderId,
      leaderName: result.leaderName,
      matchPercent: result.matchPercent,
      matchReasons: result.matchReasons,
      matchedAt: new Date().toISOString(),
    });

    appendMatchLog({
      id: `match-${Date.now()}`,
      residentName: currentUser?.name ?? "当前居民",
      leaderId: result.leaderId,
      leaderName: result.leaderName,
      matchPercent: result.matchPercent,
      createdAt: new Date().toISOString(),
    });

    if (result.matchId) {
      try {
        await fetch("/api/leaders/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId: result.matchId }),
        });
      } catch {
        // Best effort; local fallback has already been written.
      }
    } else {
      appendLocalNotification({
        type: "leader_matched",
        title: `已匹配小组长：${result.leaderName}`,
        content: "您可以在群聊中和小组长互动了。",
        linkUrl: "/group",
      });
    }

    showToast(`已选择 ${result.leaderName} 作为您的小组长`, "success");
    router.push("/me");
  }

  const progress = typeof step === "number" ? Math.round((step / 7) * 100) : 100;

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <header className="flex items-center gap-3 pb-2 pt-6">
          <button
            type="button"
            onClick={goBack}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-cream text-navy shadow-soft active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.1} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-navy">小组长智能匹配</h1>
            <p className="mt-1 text-xs text-navy/55">帮您找到更合适的社区健康小组长</p>
          </div>
          <Users className="h-5 w-5 text-sage" />
        </header>

        <div className="rounded-full bg-[#F3E4CD] p-1">
          <div
            className="h-2 rounded-full bg-sage transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {step !== "result" ? (
          <>
            <p className="text-center text-sm font-semibold text-navy/55">
              第 {step} / 7 步
            </p>

            <SectionCard>
              <h2 className="text-lg font-semibold text-navy">{stepLabels[step]}</h2>
              <div className="mt-5 space-y-3">
                {step === 1 && (
                  <div className="space-y-3">
                    {areaOptions.map((area) => (
                      <button
                        key={area}
                        type="button"
                        onClick={() => {
                          setForm((prev) => ({ ...prev, area }));
                          goNext();
                        }}
                        className={`flex w-full items-center justify-between rounded-[22px] border px-4 py-4 text-left transition active:scale-[0.98] ${
                          form.area === area
                            ? "border-sage bg-[#EEF5F3] text-navy"
                            : "border-line bg-[#FFF8ED] text-navy hover:bg-[#FAF0DD]"
                        }`}
                      >
                        <span className="text-sm font-semibold">{area}</span>
                        {form.area === area && <Check className="h-4 w-4 text-sage" />}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, area: "" }));
                        goNext();
                      }}
                      className="flex w-full items-center justify-between rounded-[22px] border border-line bg-[#FFF8ED] px-4 py-4 text-left text-sm font-semibold text-navy transition hover:bg-[#FAF0DD] active:scale-[0.98]"
                    >
                      <span>不确定 / 跳过</span>
                      <ChevronRight className="h-4 w-4 text-navy/40" />
                    </button>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-3">
                    <p className="text-xs text-navy/55">可多选，也可跳过</p>
                    <div className="flex flex-wrap gap-2">
                      {chronicTagOptions.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleChronicTag(tag)}
                          className={`rounded-full px-4 py-2.5 text-sm font-semibold transition active:scale-95 ${
                            form.chronicTags.includes(tag)
                              ? "bg-sage text-white"
                              : "border border-line bg-[#FFF8ED] text-navy"
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={goNext}
                      className="mt-2 w-full rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white active:scale-95"
                    >
                      {form.chronicTags.length > 0 ? "下一步" : "跳过"}
                    </button>
                  </div>
                )}

                {step >= 3 && step <= 7 && (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const key = getFormKey(step);
                        setForm((prev) => ({ ...prev, [key]: true }));
                        goNext();
                      }}
                      className="flex-1 rounded-full bg-navy px-5 py-3.5 text-sm font-semibold text-white active:scale-95"
                    >
                      是
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const key = getFormKey(step);
                        setForm((prev) => ({ ...prev, [key]: false }));
                        goNext();
                      }}
                      className="flex-1 rounded-full border border-line bg-cream px-5 py-3.5 text-sm font-semibold text-navy active:scale-95"
                    >
                      不需要
                    </button>
                  </div>
                )}
              </div>
            </SectionCard>
          </>
        ) : (
          <>
            <SectionCard>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber" />
                <h2 className="text-lg font-semibold text-navy">为您推荐的小组长</h2>
              </div>
              <p className="mt-2 text-sm text-navy/55">
                根据您的需求，我们为您匹配了以下小组长。
              </p>
            </SectionCard>

            <div className="space-y-4">
              {results.map((result, index) => (
                <LeaderResultCard
                  key={result.leaderId}
                  result={result}
                  rank={index + 1}
                  onSelect={() => void handleSelectLeader(result)}
                  onViewGroup={() => router.push("/group")}
                />
              ))}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setForm({
                    area: "",
                    chronicTags: [],
                    phoneDifficulty: false,
                    elderlyAlone: false,
                    healthCheckNeed: false,
                    checkInWilling: false,
                    antiScamNeed: false,
                  });
                }}
                className="flex-1 rounded-full border border-line bg-cream px-5 py-3 text-sm font-semibold text-navy active:scale-95"
              >
                重新匹配
              </button>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="flex-1 rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white active:scale-95"
              >
                返回首页
              </button>
            </div>

            <div className="rounded-[22px] border border-amber/25 bg-[#FFF8ED] px-4 py-3">
              <p className="text-xs leading-5 text-navy/55">
                小组长提供邻里互助和健康提醒，不替代医生诊断与治疗建议。如有健康问题，请联系家医团队。
              </p>
            </div>
          </>
        )}
      </div>
    </PhoneShell>
  );
}

function getFormKey(step: number): keyof MatchFormData {
  switch (step) {
    case 3:
      return "phoneDifficulty";
    case 4:
      return "elderlyAlone";
    case 5:
      return "healthCheckNeed";
    case 6:
      return "checkInWilling";
    case 7:
      return "antiScamNeed";
    default:
      return "phoneDifficulty";
  }
}

function LeaderResultCard({
  result,
  rank,
  onSelect,
  onViewGroup,
}: {
  result: UnifiedResult;
  rank: number;
  onSelect: () => void;
  onViewGroup: () => void;
}) {
  const subtitle = [
    result.leaderArea,
    result.leaderBuilding,
    result.leaderAge ? `${result.leaderAge}岁` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-[24px] border border-line/60 bg-white/60 p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="relative">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white shadow-soft"
            style={{ backgroundColor: result.leaderAvatarColor }}
          >
            {result.leaderName.slice(0, 1)}
          </div>
          <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber text-[11px] font-bold text-white shadow-soft">
            {rank}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold text-navy">{result.leaderName}</p>
            <span className="rounded-full bg-sage/15 px-2.5 py-0.5 text-[11px] font-semibold text-sage">
              匹配 {result.matchPercent}%
            </span>
          </div>
          {subtitle && <p className="mt-1 text-xs text-navy/55">{subtitle}</p>}
          {result.leaderDescription && (
            <p className="mt-2 text-sm leading-6 text-navy/68">{result.leaderDescription}</p>
          )}
        </div>
      </div>

      {result.matchReasons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {result.matchReasons.map((reason) => (
            <span
              key={reason}
              className="rounded-full bg-[#EEF5F3] px-2.5 py-1 text-[11px] font-medium text-sage"
            >
              {reason}
            </span>
          ))}
        </div>
      )}

      {result.leaderStrengths.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {result.leaderStrengths.map((strength) => (
            <span
              key={strength}
              className="rounded-full bg-[#F3E4CD] px-2.5 py-1 text-[11px] font-medium text-navy/65"
            >
              {strength}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 rounded-full bg-navy px-4 py-2.5 text-sm font-semibold text-white active:scale-95"
        >
          选择 TA
        </button>
        <button
          type="button"
          onClick={onViewGroup}
          className="rounded-full border border-line bg-cream px-4 py-2.5 text-sm font-semibold text-navy active:scale-95"
        >
          查看小组
        </button>
      </div>
    </div>
  );
}

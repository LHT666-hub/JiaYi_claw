"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  ClipboardCheck,
  Droplets,
  Gift,
  HeartPulse,
  MessageSquareText,
  Pill,
  Stethoscope,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { PointsBadge } from "@/components/PointsBadge";
import { SafetyNotice } from "@/components/SafetyNotice";
import { SectionCard } from "@/components/SectionCard";
import { TaskCard } from "@/components/TaskCard";
import { useToast } from "@/components/ToastProvider";
import { STORAGE_CHANGE_EVENT, getTodayKey, readMergedTasks } from "@/lib/storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile, fetchSupabaseTasks, fetchTaskRecords } from "@/lib/supabase/mvp";
import { ManagedTaskItem, ProfileRow, SupabaseTaskRow } from "@/lib/types";
import { useClawState } from "@/lib/useClawState";

const iconMap = {
  medicine: Pill,
  record: HeartPulse,
  course: BookOpen,
  group: MessageSquareText,
  followup: ClipboardCheck,
  other: Activity,
};

const categoryLabelMap: Record<string, string> = {
  medicine: "用药",
  record: "记录",
  course: "学习",
  group: "互助",
  followup: "随访",
  other: "其他",
};

const categoryOrder = ["medicine", "record", "course", "group", "followup", "other"];

const rewards = [
  { id: "reward-rice", name: "大米", points: 60, icon: Gift },
  { id: "reward-eggs", name: "鸡蛋", points: 40, icon: Droplets },
  { id: "reward-pillbox", name: "药盒", points: 35, icon: Pill },
  { id: "reward-book", name: "血压记录本", points: 28, icon: Activity },
  { id: "reward-therapy", name: "中医理疗体验", points: 96, icon: Stethoscope },
  { id: "reward-tea", name: "医生审核药茶体验", points: 88, icon: HeartPulse },
];

type SyncMode = "local" | "supabase";

function mapSupabaseTask(task: SupabaseTaskRow): ManagedTaskItem {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? "",
    category: task.category as ManagedTaskItem["category"],
    points: Number(task.points ?? 0),
    isActive: task.is_active,
    createdAt: task.created_at ?? new Date().toISOString(),
    updatedAt: task.updated_at ?? new Date().toISOString(),
  };
}

export default function TasksPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { state, completeTask: completeLocalTask, redeemReward: redeemLocalReward } = useClawState();
  const { showToast } = useToast();
  const [syncMode, setSyncMode] = useState<SyncMode>("local");
  const [taskItems, setTaskItems] = useState<ManagedTaskItem[]>(() => readMergedTasks());
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>(state.completedTaskIds);
  const [points, setPoints] = useState<number>(state.points);

  useEffect(() => {
    if (syncMode !== "local") {
      return;
    }

    setPoints(state.points);
    setCompletedTaskIds(state.completedTaskIds);
  }, [state.completedTaskIds, state.points, syncMode]);

  useEffect(() => {
    function syncLocalTasks() {
      if (syncMode !== "local") {
        return;
      }

      setTaskItems(readMergedTasks());
    }

    syncLocalTasks();
    window.addEventListener(STORAGE_CHANGE_EVENT, syncLocalTasks);
    window.addEventListener("storage", syncLocalTasks);

    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, syncLocalTasks);
      window.removeEventListener("storage", syncLocalTasks);
    };
  }, [syncMode]);

  async function loadSupabaseState(profileOverride?: ProfileRow | null) {
    if (!supabase) {
      throw new Error("Supabase unavailable");
    }

    const profile = profileOverride ?? (await fetchCurrentProfile(supabase));

    if (!profile || profile.role !== "resident") {
      throw new Error("Current user is not a resident");
    }

    const [remoteTasks, remoteRecords, summaryResponse] = await Promise.all([
      fetchSupabaseTasks(supabase),
      fetchTaskRecords(supabase, profile.id),
      fetch("/api/points/summary", { method: "GET", cache: "no-store" }),
    ]);

    if (!summaryResponse.ok) {
      const payload = (await summaryResponse.json().catch(() => ({}))) as { message?: string };
      throw new Error(payload.message ?? "Failed to load points summary");
    }

    const summaryPayload = (await summaryResponse.json()) as {
      totalPoints?: number;
    };
    const todayKey = getTodayKey();
    const todayCompletedTaskIds = remoteRecords
      .filter((item) => item.completed_on === todayKey)
      .map((item) => item.task_id);

    setTaskItems(remoteTasks.map(mapSupabaseTask));
    setCompletedTaskIds(todayCompletedTaskIds);
    setPoints(Number(summaryPayload.totalPoints ?? 0));
    setSyncMode("supabase");
  }

  function activateLocalFallback() {
    setSyncMode("local");
    setTaskItems(readMergedTasks());
    setCompletedTaskIds(state.completedTaskIds);
    setPoints(state.points);
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (!supabase) {
        activateLocalFallback();
        return;
      }

      try {
        const profile = await fetchCurrentProfile(supabase);

        if (!active) {
          return;
        }

        if (!profile || profile.role !== "resident") {
          activateLocalFallback();
          return;
        }

        await loadSupabaseState(profile);
      } catch {
        if (active) {
          activateLocalFallback();
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function handleCompleteTask(task: ManagedTaskItem) {
    if (syncMode === "supabase") {
      try {
        const response = await fetch("/api/tasks/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ taskId: task.id }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
          totalPoints?: number;
          alreadyCompleted?: boolean;
          already_completed?: boolean;
        };

        if (!response.ok) {
          throw new Error(payload.message ?? "Failed to complete task");
        }

        const alreadyCompleted = payload.alreadyCompleted ?? payload.already_completed ?? false;

        setCompletedTaskIds((current) =>
          current.includes(task.id) ? current : [...current, task.id],
        );
        setPoints(Number(payload.totalPoints ?? points));

        showToast(
          alreadyCompleted ? "今天已经完成过这个任务了" : `任务已完成，+${task.points} 分`,
          alreadyCompleted ? "warning" : "success",
        );

        await loadSupabaseState();
        return;
      } catch {
        activateLocalFallback();
        const changed = completeLocalTask(task.id, task.points, task.title);
        showToast(
          changed ? "接口暂时不可用，已回退到本地演示积分。" : "这项任务今天已经完成过了。",
          "warning",
        );
        return;
      }
    }

    const changed = completeLocalTask(task.id, task.points, task.title);
    showToast(
      changed ? `任务已完成，+${task.points} 分` : "这项任务今天已经完成过了。",
      changed ? "success" : "warning",
    );
  }

  async function handleExchange(reward: (typeof rewards)[number]) {
    if (syncMode === "supabase") {
      try {
        const response = await fetch("/api/points/exchange", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            itemName: reward.name,
            pointsCost: reward.points,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
          insufficient?: boolean;
          totalPoints?: number;
        };

        if (!response.ok) {
          if (payload.insufficient) {
            showToast(payload.message ?? "当前积分不足，暂时无法兑换。", "warning");
            return;
          }

          throw new Error(payload.message ?? "Failed to exchange points");
        }

        setPoints(Number(payload.totalPoints ?? points));
        showToast(`已兑换 ${reward.name}`, "success");
        await loadSupabaseState();
        return;
      } catch {
        activateLocalFallback();
        const success = redeemLocalReward(reward.name, reward.points);
        showToast(
          success ? `接口暂时不可用，已用本地模式兑换 ${reward.name}。` : "积分不足，先去完成任务吧。",
          "warning",
        );
        return;
      }
    }

    const success = redeemLocalReward(reward.name, reward.points);
    showToast(
      success ? `已兑换 ${reward.name}` : "积分不足，先去完成任务吧。",
      success ? "success" : "warning",
    );
  }

  const streakDays = state.streakDays;
  const todayCompletedCount = completedTaskIds.length;
  const todayTotalCount = taskItems.length;

  const groupedTasks = useMemo(() => {
    const groups: Record<string, ManagedTaskItem[]> = {};
    for (const task of taskItems) {
      const cat = task.category || "other";
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(task);
    }
    return categoryOrder
      .filter((cat) => groups[cat]?.length)
      .map((cat) => ({ category: cat, label: categoryLabelMap[cat] || cat, tasks: groups[cat] }));
  }, [taskItems]);

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="今日任务" subtitle="今天完成这些，可以领积分。" />

        {/* Progress Card */}
        <section className="rounded-[30px] bg-gradient-to-br from-navy to-navySoft px-5 py-5 text-white shadow-float">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-[11px] tracking-wide text-white/60">今日完成</p>
              <p className="mt-1.5 text-xl font-bold">{todayCompletedCount}/{todayTotalCount}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-wide text-white/60">今日积分</p>
              <p className="mt-1.5 text-xl font-bold text-[#F5D5A0]">
                +{taskItems.filter((t) => completedTaskIds.includes(t.id)).reduce((s, t) => s + t.points, 0)}
              </p>
            </div>
            <div>
              <p className="text-[11px] tracking-wide text-white/60">总积分</p>
              <p className="mt-1.5 text-xl font-bold">{points}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-wide text-white/60">连续打卡</p>
              <p className="mt-1.5 flex items-center justify-center gap-1 text-xl font-bold">
                {streakDays}
                <ClipboardCheck className="h-4 w-4 text-white/70" />
              </p>
            </div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-white/20">
            <div
              className="h-2 rounded-full bg-[#F5D5A0] transition-all duration-500"
              style={{ width: `${todayTotalCount > 0 ? (todayCompletedCount / todayTotalCount) * 100 : 0}%` }}
            />
          </div>
        </section>

        {/* Streak Bonus */}
        <div className="flex items-center justify-between rounded-[22px] bg-[#FAEEDB] px-4 py-3">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-amber" />
            <p className="text-sm text-navy">
              已连续 <span className="font-bold">{streakDays}</span> 天，再坚持 2 天额外 +30 分
            </p>
          </div>
          <PointsBadge points={30} />
        </div>

        {/* Tasks by category */}
        {groupedTasks.map((group) => (
          <SectionCard key={group.category} title={group.label}>
            <div className="space-y-3">
              {group.tasks.map((task) => {
                const Icon = iconMap[task.category] ?? Activity;
                return (
                  <TaskCard
                    key={task.id}
                    title={task.title}
                    description={task.description}
                    points={task.points}
                    icon={Icon}
                    completed={completedTaskIds.includes(task.id)}
                    onComplete={() => void handleCompleteTask(task)}
                  />
                );
              })}
            </div>
          </SectionCard>
        ))}

        {/* Rewards */}
        <SectionCard title="积分兑换">
          <div className="grid grid-cols-2 gap-3">
            {rewards.map((reward) => {
              const Icon = reward.icon;
              const canAfford = points >= reward.points;
              return (
                <div
                  key={reward.id}
                  className="flex flex-col items-center rounded-[22px] border border-line/70 bg-white/35 px-3 py-4"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F7E7D4] text-navy">
                    <Icon className="h-5 w-5" strokeWidth={2.1} />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-navy">{reward.name}</p>
                  <p className="mt-1 text-xs text-navy/58">{reward.points} 分</p>
                  <button
                    type="button"
                    onClick={() => void handleExchange(reward)}
                    className={`mt-3 w-full rounded-full py-2 text-xs font-semibold transition ${
                      canAfford
                        ? "bg-navy text-white active:scale-95"
                        : "bg-navy/20 text-navy/50"
                    }`}
                  >
                    {canAfford ? "兑换" : "积分不足"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <SafetyNotice tone="danger">
              积分不能提现、不能充值、不能购买处方药、不能医保支付，也不承诺疗效。
            </SafetyNotice>
          </div>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}

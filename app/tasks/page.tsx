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
import { tasks as localTasks } from "@/data/tasks";
import { getActiveTasks, getTaskRecords } from "@/lib/db/tasks";
import { getResidentPoints } from "@/lib/db/points";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile, resolveResidentScope } from "@/lib/supabase/mvp";
import { AppRole, SupabaseTaskRow, TaskItem } from "@/lib/types";
import { useClawState } from "@/lib/useClawState";

const iconMap = {
  medicine: Pill,
  record: HeartPulse,
  course: BookOpen,
  group: MessageSquareText,
  followup: ClipboardCheck,
  other: Activity,
};

const rewards = [
  { id: "reward-rice", name: "大米", points: 60, icon: Gift },
  { id: "reward-eggs", name: "鸡蛋", points: 40, icon: Droplets },
  { id: "reward-pillbox", name: "药盒", points: 35, icon: Pill },
  { id: "reward-book", name: "血压记录本", points: 28, icon: Activity },
  { id: "reward-therapy", name: "中医理疗体验", points: 96, icon: Stethoscope },
  { id: "reward-tea", name: "医生审核药茶体验", points: 88, icon: HeartPulse },
];

function mapSupabaseTasks(rows: SupabaseTaskRow[]): TaskItem[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    category: (row.category as TaskItem["category"]) || "other",
    points: row.points,
  }));
}

export default function TasksPage() {
  const { state, completeTask, redeemReward } = useClawState();
  const { showToast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [syncMode, setSyncMode] = useState<"local" | "supabase">("local");
  const [role, setRole] = useState<AppRole | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>(localTasks);
  const [points, setPoints] = useState(state.points);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>(state.completedTaskIds);

  useEffect(() => {
    let active = true;

    async function loadSupabaseState() {
      if (!supabase) {
        setIsLoading(false);
        return;
      }

      const profile = await fetchCurrentProfile(supabase);

      if (!active || !profile) {
        setIsLoading(false);
        return;
      }

      setRole(profile.role);

      const residentScope = await resolveResidentScope(supabase, profile);

      if (!active || !residentScope.residentId) {
        setIsLoading(false);
        return;
      }

      const [taskRows, taskRecords, pointsResult] = await Promise.all([
        getActiveTasks(supabase),
        getTaskRecords(residentScope.residentId, supabase),
        getResidentPoints(residentScope.residentId, supabase),
      ]);

      if (!active) {
        return;
      }

      if (taskRows.length) {
        setTasks(mapSupabaseTasks(taskRows));
      }

      setCompletedTaskIds([...new Set(taskRecords.map((item) => item.task_id))]);
      setPoints(pointsResult.points);
      setSyncMode("supabase");
      setIsLoading(false);
    }

    void loadSupabaseState();

    return () => {
      active = false;
    };
  }, [state.completedTaskIds, state.points, supabase]);

  async function handleCompleteTask(task: TaskItem) {
    if (syncMode !== "supabase") {
      const changed = completeTask(task.id, task.points);
      showToast(
        changed ? "任务已完成，积分已增加。" : "这项任务今天已经完成了。",
        changed ? "success" : "warning",
      );
      return;
    }

    if (role !== "resident") {
      showToast("家属端当前先支持查看任务状态，完成任务仍由居民本人操作。", "info");
      return;
    }

    const response = await fetch("/api/tasks/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskId: task.id,
      }),
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      alreadyCompleted?: boolean;
      points?: number;
      message?: string;
    };

    if (!response.ok) {
      showToast(payload.message || "任务写入失败，已保留当前页面。", "warning");
      return;
    }

    if (payload.alreadyCompleted) {
      showToast("这项任务今天已经记录过了。", "warning");
      return;
    }

    setCompletedTaskIds((current) => [...new Set([...current, task.id])]);
    setPoints(payload.points ?? points + task.points);
    completeTask(task.id, task.points);
    showToast("任务已完成，积分已同步到数据库。", "success");
  }

  async function handleExchange(reward: (typeof rewards)[number]) {
    if (syncMode !== "supabase") {
      const success = redeemReward(reward.name, reward.points);
      showToast(
        success ? `已兑换 ${reward.name}。` : "积分不足，先去完成任务吧。",
        success ? "success" : "warning",
      );
      return;
    }

    if (role !== "resident") {
      showToast("当前角色暂不支持直接发起积分兑换。", "info");
      return;
    }

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

    const payload = (await response.json()) as {
      ok?: boolean;
      points?: number;
      message?: string;
      insufficient?: boolean;
    };

    if (!response.ok) {
      showToast(payload.message || "兑换失败，请稍后再试。", payload.insufficient ? "warning" : "info");
      return;
    }

    setPoints(payload.points ?? points - reward.points);
    showToast(`已兑换 ${reward.name}，积分流水已写入数据库。`, "success");
  }

  const streakDays = state.streakDays;

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader
          title="今日任务"
          subtitle={
            syncMode === "supabase"
              ? role === "family"
                ? "当前显示已绑定居民的任务状态"
                : "今天完成这些，可以领积分"
              : "今天完成这些，可以领积分"
          }
        />

        <section className="rounded-[30px] bg-gradient-to-br from-navy to-navySoft px-5 py-5 text-white shadow-float">
          <p className="text-sm tracking-[0.18em] text-white/70">我的积分</p>
          <p className="mt-3 font-brand text-[2rem] font-semibold">{points}</p>
          <p className="mt-2 text-sm leading-6 text-white/74">
            {syncMode === "supabase"
              ? "积分已从 points_ledger 汇总计算。"
              : "当前为本地演示积分，Supabase 未配置时会自动回退。"}
          </p>
        </section>

        <SectionCard title="今日任务列表">
          <div className="space-y-3">
            {tasks.map((task) => {
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
          {isLoading ? (
            <p className="mt-4 text-xs text-navy/55">正在读取任务与积分数据...</p>
          ) : null}
        </SectionCard>

        <SectionCard title="连续打卡">
          <div className="rounded-[24px] bg-[#FAEEDB] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-navy">已连续完成 {streakDays} 天</p>
                <p className="mt-2 text-sm leading-6 text-navy/66">再坚持 2 天，额外 +30 分</p>
              </div>
              <PointsBadge points={30} />
            </div>
            <div className="mt-4 h-3 rounded-full bg-white/65">
              <div className="h-3 w-[72%] rounded-full bg-sage" />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="积分兑换">
          <div className="space-y-3">
            {rewards.map((reward) => {
              const Icon = reward.icon;
              return (
                <div
                  key={reward.id}
                  className="flex items-center justify-between rounded-[24px] border border-line/70 bg-white/35 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F7E7D4] text-navy">
                      <Icon className="h-5 w-5" strokeWidth={2.1} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-navy">{reward.name}</p>
                      <p className="mt-1 text-xs text-navy/58">需要 {reward.points} 分</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleExchange(reward)}
                    className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white"
                  >
                    兑换
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <SafetyNotice tone="danger">
              积分不能提现、不能充值、不能购买处方药、不能医保支付，不承诺治疗效果。
            </SafetyNotice>
          </div>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}

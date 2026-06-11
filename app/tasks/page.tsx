"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  Users,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
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
import { useDemoUser } from "@/lib/useDemoUser";

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

type SyncMode = "local" | "supabase";
type AuthMode = "loading" | "real" | "demo" | "none";

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

function pickTaskSections(taskItems: ManagedTaskItem[]) {
  const mustDoIds = ["task-medicine-am", "task-pressure-record", "task-followup-confirm"];
  const optionalIds = ["task-course-preview", "task-group-reply", "task-family-share"];
  const byId = new Map(taskItems.map((task) => [task.id, task]));

  const mustDo = mustDoIds
    .map((id) => byId.get(id))
    .filter(Boolean) as ManagedTaskItem[];
  const filledMustDo =
    mustDo.length >= 3
      ? mustDo.slice(0, 3)
      : [
          ...mustDo,
          ...taskItems.filter((task) => !mustDo.some((item) => item.id === task.id)),
        ].slice(0, 3);

  const optional = optionalIds
    .map((id) => byId.get(id))
    .filter(Boolean) as ManagedTaskItem[];
  const optionalFilled = [
    ...optional,
    ...taskItems.filter(
      (task) =>
        !filledMustDo.some((item) => item.id === task.id) &&
        !optional.some((item) => item.id === task.id),
    ),
  ];

  return {
    mustDo: filledMustDo,
    optional: optionalFilled,
  };
}

export default function TasksPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { currentUser } = useDemoUser();
  const { state, completeTask: completeLocalTask, redeemReward: redeemLocalReward } = useClawState();
  const { showToast } = useToast();
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>("local");
  const [taskItems, setTaskItems] = useState<ManagedTaskItem[]>(() => readMergedTasks());
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>(state.completedTaskIds);
  const [points, setPoints] = useState<number>(state.points);
  const [remoteError, setRemoteError] = useState<string | null>(null);

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

  const loadSupabaseState = useCallback(async (profileOverride?: ProfileRow | null) => {
    if (!supabase) {
      throw new Error("service unavailable");
    }

    const profile = profileOverride ?? (await fetchCurrentProfile(supabase));

    if (!profile || profile.role !== "resident") {
      throw new Error("resident profile unavailable");
    }

    const [remoteTasks, remoteRecords, summaryResponse] = await Promise.all([
      fetchSupabaseTasks(supabase),
      fetchTaskRecords(supabase, profile.id),
      fetch("/api/points/summary", { method: "GET", cache: "no-store" }),
    ]);

    if (!summaryResponse.ok) {
      const payload = (await summaryResponse.json().catch(() => ({}))) as { message?: string };
      throw new Error(payload.message ?? "failed to load points");
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
    setRemoteError(null);
  }, [supabase]);

  const activateLocalFallback = useCallback(() => {
    setSyncMode("local");
    setRemoteError(null);
    setTaskItems(readMergedTasks());
    setCompletedTaskIds(state.completedTaskIds);
    setPoints(state.points);
  }, [state.completedTaskIds, state.points]);

  const activateFamilyReadonly = useCallback(() => {
    setSyncMode("local");
    setRemoteError(null);
    setTaskItems(readMergedTasks());
    setCompletedTaskIds([]);
    setPoints(0);
  }, []);

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

        if (!profile) {
          if (currentUser) {
            setAuthMode("demo");
            activateLocalFallback();
            return;
          }

          setAuthMode("none");
          router.replace("/welcome");
          return;
        }

        setProfile(profile);
        setAuthMode("real");

        if (profile.role === "resident") {
          try {
            await loadSupabaseState(profile);
          } catch {
            if (!active) {
              return;
            }
            setSyncMode("supabase");
            setTaskItems([]);
            setCompletedTaskIds([]);
            setPoints(0);
            setRemoteError("当前账号的任务和积分暂时还没同步成功，请稍后刷新再试。");
          }
          return;
        }

        if (profile.role === "family") {
          activateFamilyReadonly();
          return;
        }

        activateFamilyReadonly();
      } catch {
        if (active) {
          if (currentUser) {
            setAuthMode("demo");
            activateLocalFallback();
            return;
          }

          setAuthMode("none");
          router.replace("/welcome");
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [activateFamilyReadonly, activateLocalFallback, currentUser, loadSupabaseState, router, supabase]);

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
          throw new Error(payload.message ?? "failed to complete task");
        }

        const alreadyCompleted = payload.alreadyCompleted ?? payload.already_completed ?? false;

        setCompletedTaskIds((current) =>
          current.includes(task.id) ? current : [...current, task.id],
        );
        setPoints(Number(payload.totalPoints ?? points));

        showToast(
          alreadyCompleted ? "今天已经完成过这件事了" : `已完成，积分 +${task.points}`,
          alreadyCompleted ? "warning" : "success",
        );

        await loadSupabaseState();
        return;
      } catch {
        setRemoteError("任务完成状态暂时没有同步成功，请稍后重试。");
        showToast("任务完成状态暂时没有同步成功，请稍后重试。", "warning");
        return;
      }
    }

    const changed = completeLocalTask(task.id, task.points, task.title);
    showToast(
      changed ? `已完成，积分 +${task.points}` : "这件事今天已经完成了",
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
            showToast(payload.message ?? "当前积分不足，先完成健康小事吧", "warning");
            return;
          }

          throw new Error(payload.message ?? "failed to exchange points");
        }

        setPoints(Number(payload.totalPoints ?? points));
        showToast(`已兑换 ${reward.name}`, "success");
        await loadSupabaseState();
        return;
      } catch {
        setRemoteError("积分兑换暂时没有同步成功，请稍后重试。");
        showToast("积分兑换暂时没有同步成功，请稍后重试。", "warning");
        return;
      }
    }

    const success = redeemLocalReward(reward.name, reward.points);
    showToast(
      success ? `已兑换 ${reward.name}` : "积分不足，先去完成健康小事吧",
      success ? "success" : "warning",
    );
  }

  const streakDays = authMode === "real" ? 0 : state.streakDays;
  const { mustDo, optional } = useMemo(() => pickTaskSections(taskItems), [taskItems]);
  const todayCompletedCount = completedTaskIds.length;
  const todayTotalCount = taskItems.length;
  const todayAwardedPoints = taskItems
    .filter((task) => completedTaskIds.includes(task.id))
    .reduce((sum, task) => sum + task.points, 0);
  const role = authMode === "real" ? profile?.role : currentUser?.role;
  const isResident = role === "resident";
  const isFamily = role === "family";

  if (authMode === "loading") {
    return (
      <PhoneShell showBottomNav>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="今日健康计划" subtitle="正在读取当前身份..." />
          <SectionCard>
            <EmptyState
              title="正在准备任务页面"
              description="我们正在根据当前身份加载合适的任务和积分信息。"
            />
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  if (authMode === "none") {
    return (
      <PhoneShell showBottomNav>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="今日健康计划" subtitle="请先选择身份。" />
          <SectionCard>
            <EmptyState
              title="请先选择身份"
              description="选择身份后，家医 Claw 会显示适合您的服务入口。"
            />
            <button
              type="button"
              onClick={() => router.push("/welcome")}
              className="mt-4 w-full rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white"
            >
              开始使用
            </button>
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  if (!isResident && !isFamily) {
    return (
      <PhoneShell showBottomNav>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="今日健康计划" subtitle="当前页面主要给居民和家属查看。" />
          <SectionCard>
            <EmptyState
              title="当前身份不适用任务页"
              description="工作人员可前往工作台查看待处理问题、风险提醒和状态更新。"
            />
            <button
              type="button"
              onClick={() => router.push(role === "admin" ? "/admin" : "/doctor")}
              className="mt-4 w-full rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white"
            >
              进入对应工作台
            </button>
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader
          title={isFamily ? "老人任务情况" : "今日健康计划"}
          subtitle={
            isFamily
              ? authMode === "real"
                ? "家属账号当前用于只读查看与提醒，不会直接替老人完成任务。"
                : "这里先只读查看，方便帮老人提醒。"
              : "先完成必做，再做加分项。"
          }
        />

        {isFamily ? (
          <SectionCard>
            <div className="rounded-[22px] border border-[#BFD9CB] bg-[#EAF4EE] px-4 py-4">
              <p className="text-sm font-semibold text-[#355C52]">家属只读提醒</p>
              <p className="mt-1 text-sm leading-6 text-[#355C52]/90">
                家属端当前主要用于查看老人今天的任务安排、积分和提醒进度，不会直接替老人完成任务或兑换积分。
              </p>
            </div>
          </SectionCard>
        ) : null}

        <section className="rounded-[30px] bg-gradient-to-br from-navy to-navySoft px-5 py-5 text-white shadow-float">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-[11px] tracking-wide text-white/60">今日完成</p>
              <p className="mt-1.5 text-xl font-bold">
                {todayCompletedCount}/{todayTotalCount}
              </p>
            </div>
            <div>
              <p className="text-[11px] tracking-wide text-white/60">今日积分</p>
              <p className="mt-1.5 text-xl font-bold text-[#F5D5A0]">+{todayAwardedPoints}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-wide text-white/60">我的积分</p>
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
              style={{
                width: `${todayTotalCount > 0 ? (todayCompletedCount / todayTotalCount) * 100 : 0}%`,
              }}
            />
          </div>
        </section>

        {authMode === "real" && remoteError ? (
          <SectionCard>
            <div className="rounded-[22px] border border-amber/25 bg-[#FFF6EA] px-4 py-4">
              <p className="text-sm font-semibold text-navy">数据同步稍有延迟</p>
              <p className="mt-1 text-sm leading-6 text-navy/66">{remoteError}</p>
            </div>
          </SectionCard>
        ) : null}

        <div className="flex items-center justify-between rounded-[22px] bg-surface-tint px-4 py-3">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-amber" />
            <p className="text-sm text-navy">
              已连续 <span className="font-bold">{streakDays}</span> 天，再坚持 2 天额外 +30 分
            </p>
          </div>
          <PointsBadge points={30} />
        </div>

        <SectionCard title="今日必做">
          {mustDo.length ? (
            <div className="space-y-3">
              {mustDo.map((task) => {
                const Icon = iconMap[task.category] ?? ClipboardCheck;
                return (
                  <TaskCard
                    key={task.id}
                    title={task.title}
                    description={task.description}
                    points={task.points}
                    icon={Icon}
                    variant="plan"
                    completed={completedTaskIds.includes(task.id)}
                    onComplete={isFamily ? undefined : () => void handleCompleteTask(task)}
                    actionLabel={isFamily ? "仅查看" : undefined}
                    actionDisabled={isFamily}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              title={authMode === "real" ? "任务暂未同步" : "暂时还没有任务"}
              description={
                authMode === "real"
                  ? "等当前账号的任务数据同步成功后，这里会显示今天需要完成的健康小事。"
                  : "今天的必做任务会显示在这里。"
              }
            />
          )}
        </SectionCard>

        <SectionCard title="可选加分">
          {optional.length ? (
            <div className="space-y-3">
              {optional.map((task) => {
                const Icon = iconMap[task.category] ?? Users;
                return (
                  <TaskCard
                    key={task.id}
                    title={task.title}
                    description={task.description}
                    points={task.points}
                    icon={Icon}
                    variant="plan"
                    completed={completedTaskIds.includes(task.id)}
                    onComplete={isFamily ? undefined : () => void handleCompleteTask(task)}
                    actionLabel={isFamily ? "仅查看" : undefined}
                    actionDisabled={isFamily}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              title={authMode === "real" ? "加分任务暂未同步" : "暂时还没有加分项"}
              description={
                authMode === "real"
                  ? "任务同步完成后，这里会显示当前账号可参与的加分项。"
                  : "今天的可选加分任务会显示在这里。"
              }
            />
          )}
        </SectionCard>

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
                    onClick={() => {
                      if (isFamily) {
                        showToast("家属端当前只读查看，积分兑换请由老人账号操作。", "info");
                        return;
                      }
                      void handleExchange(reward);
                    }}
                    className={`mt-3 w-full rounded-full py-2 text-xs font-semibold transition ${
                      isFamily
                        ? "bg-navy/20 text-navy/50"
                        : canAfford
                        ? "bg-navy text-white active:scale-95"
                        : "bg-navy/20 text-navy/50"
                    }`}
                  >
                    {isFamily ? "仅老人可兑换" : canAfford ? "兑换" : "积分不足"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <SafetyNotice tone="danger">
              积分不能提现、不能充值、不能购买处方药、不能医保支付，也不承诺治疗效果。
            </SafetyNotice>
          </div>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}

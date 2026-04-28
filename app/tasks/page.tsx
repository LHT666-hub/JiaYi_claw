"use client";

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
import { tasks } from "@/data/tasks";
import { useToast } from "@/components/ToastProvider";
import { useClawState } from "@/lib/useClawState";

const iconMap = {
  medicine: Pill,
  record: HeartPulse,
  course: BookOpen,
  group: MessageSquareText,
  followup: ClipboardCheck,
};

const rewards = [
  { id: "reward-rice", name: "大米", points: 60, icon: Gift },
  { id: "reward-eggs", name: "鸡蛋", points: 40, icon: Droplets },
  { id: "reward-pillbox", name: "药盒", points: 35, icon: Pill },
  { id: "reward-book", name: "血压记录本", points: 28, icon: Activity },
  { id: "reward-therapy", name: "中医理疗体验", points: 96, icon: Stethoscope },
  { id: "reward-tea", name: "医生审核药茶体验", points: 88, icon: HeartPulse },
];

export default function TasksPage() {
  const { state, completeTask, redeemReward } = useClawState();
  const { showToast } = useToast();

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="今日任务" subtitle="今天完成这些，可以领积分" />

        <section className="rounded-[30px] bg-gradient-to-br from-navy to-navySoft px-5 py-5 text-white shadow-float">
          <p className="text-sm tracking-[0.18em] text-white/70">我的积分</p>
          <p className="mt-3 font-brand text-[2rem] font-semibold">{state.points}</p>
          <p className="mt-2 text-sm leading-6 text-white/74">
            今天完成这些，可以领积分
          </p>
        </section>

        <SectionCard title="今日任务列表">
          <div className="space-y-3">
            {tasks.map((task) => {
              const Icon = iconMap[task.category];
              return (
                <TaskCard
                  key={task.id}
                  title={task.title}
                  description={task.description}
                  points={task.points}
                  icon={Icon}
                  completed={state.completedTaskIds.includes(task.id)}
                  onComplete={() => {
                    const changed = completeTask(task.id, task.points);
                    showToast(changed ? "任务已完成，积分已到账" : "这项任务今天已经完成了", changed ? "success" : "warning");
                  }}
                />
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="连续打卡">
          <div className="rounded-[24px] bg-[#FAEEDB] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-navy">已连续完成 {state.streakDays} 天</p>
                <p className="mt-2 text-sm leading-6 text-navy/66">
                  再坚持 2 天，额外 +30 分
                </p>
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
                    onClick={() => {
                      const success = redeemReward(reward.name, reward.points);
                      showToast(success ? `已兑换 ${reward.name}` : "积分不足，先去完成任务吧", success ? "success" : "warning");
                    }}
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

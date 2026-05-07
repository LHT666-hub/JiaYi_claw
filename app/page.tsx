"use client";

import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight, ClipboardCheck, HeartPulse, Pill, Users } from "lucide-react";
import { contacts } from "@/data/contacts";
import { courses } from "@/data/courses";
import { notifications } from "@/data/notifications";
import { tasks } from "@/data/tasks";
import { ContactAvatar } from "@/components/ContactAvatar";
import { PhoneShell } from "@/components/PhoneShell";
import { PointsBadge } from "@/components/PointsBadge";
import { PrimaryClawCard } from "@/components/PrimaryClawCard";
import { SectionCard } from "@/components/SectionCard";
import { TaskCard } from "@/components/TaskCard";
import { TopBar } from "@/components/TopBar";
import { useToast } from "@/components/ToastProvider";
import { useClawState } from "@/lib/useClawState";

const previewTaskIcons = [Pill, HeartPulse, BookOpen];

export default function HomePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { state, completeTask, completeGroupCheckIn } = useClawState();

  const quickContacts = contacts.slice(0, 6);
  const previewTasks = tasks.slice(0, 3);
  const featuredCourse = courses[0];
  const unreadNotificationCount = notifications.filter(
    (item) => !state.readNotificationIds.includes(item.id),
  ).length;

  const todayCompleted = state.completedTaskIds.length;
  const todayTotal = tasks.length;
  const todayPoints = previewTasks
    .filter((t) => state.completedTaskIds.includes(t.id))
    .reduce((sum, t) => sum + t.points, 0);

  function goToAsk(mode?: "voice" | "photo", quickQuestion?: string) {
    const params = new URLSearchParams();

    if (mode) {
      params.set("mode", mode);
    }

    if (quickQuestion) {
      params.set("q", quickQuestion);
    }

    router.push(`/ask${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <TopBar
          points={state.points}
          hasUnreadNotifications={unreadNotificationCount > 0}
          onBellClick={() => router.push("/notifications")}
        />

        <PrimaryClawCard
          onVoice={() => goToAsk("voice")}
          onPhoto={() => goToAsk("photo")}
          onText={() => goToAsk()}
          onQuickQuestion={(question) => goToAsk(undefined, question)}
        />

        <SectionCard
          title="今日健康小事"
          action={
            <button
              type="button"
              onClick={() => router.push("/tasks")}
              className="flex items-center gap-1 text-sm font-semibold text-sage"
            >
              全部任务
              <ChevronRight className="h-4 w-4" />
            </button>
          }
        >
          <div className="mb-4 flex items-center justify-between rounded-[22px] bg-[#FAEEDB] px-4 py-3">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-navy/55">今日进度</p>
                <p className="mt-1 text-lg font-semibold text-navy">
                  {todayCompleted}/{todayTotal}
                </p>
              </div>
              <div className="h-8 w-px bg-line/60" />
              <div>
                <p className="text-xs text-navy/55">已获积分</p>
                <p className="mt-1 text-lg font-semibold text-amber">+{todayPoints}</p>
              </div>
            </div>
            <div className="h-10 w-10 rounded-full border-[3px] border-sage/30 flex items-center justify-center">
              <span className="text-xs font-bold text-sage">
                {todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0}%
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {previewTasks.map((task, index) => (
              <TaskCard
                key={task.id}
                title={task.title}
                description={task.description}
                points={task.points}
                icon={previewTaskIcons[index]}
                completed={state.completedTaskIds.includes(task.id)}
                onComplete={() => {
                  const changed = completeTask(task.id, task.points);
                  showToast(
                    changed ? "已完成，积分 +${task.points}" : "这项今天已经完成了",
                    changed ? "success" : "warning",
                  );
                }}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="一键找人"
          action={
            <button
              type="button"
              onClick={() => router.push("/contacts")}
              className="flex items-center gap-1 text-sm font-semibold text-sage"
            >
              全部
              <ChevronRight className="h-4 w-4" />
            </button>
          }
        >
          <p className="mb-3 text-xs leading-5 text-navy/55">
            不知道找谁时，可以先从这里进入
          </p>
          <div className="grid grid-cols-3 gap-y-4">
            {quickContacts.map((contact) => (
              <ContactAvatar key={contact.id} contact={contact} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="我的健康小组">
          <div className="rounded-[24px] bg-[#F8F0E1] p-4">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-navy">高血压互助小组</p>
              <span className="flex items-center gap-1.5 rounded-full bg-sage/15 px-3 py-1 text-xs font-semibold text-sage">
                <Users className="h-3.5 w-3.5" />
                今日 12 人打卡
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-navy/68">
              王阿姨发了提醒：记得量血压
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => router.push("/group")}
                className="rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white"
              >
                进群看看
              </button>
              <button
                type="button"
                onClick={() => {
                  const changed = completeGroupCheckIn();
                  showToast(
                    changed ? "已完成今日小组打卡，+5 分" : "今天已经打过卡了",
                    changed ? "success" : "warning",
                  );
                }}
                className="rounded-full border border-line bg-cream px-5 py-2.5 text-sm font-semibold text-navy"
              >
                我也打卡
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="随访确认提醒">
          <div className="rounded-[24px] bg-[#FAEEDB] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F5E4D0] text-navy">
                  <ClipboardCheck className="h-5 w-5" strokeWidth={2.1} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-navy">
                    {state.followupConfirmed ? "本周随访已确认" : "王护士发来本周随访确认"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-navy/62">
                    {state.followupConfirmed
                      ? `您已回复：${state.followupResponse ?? "可按时参加"}`
                      : "请确认周三上午 9:30 的慢病随访是否方便参加。"}
                  </p>
                </div>
              </div>
              {state.followupConfirmed ? (
                <span className="rounded-full bg-[#DDEFE4] px-3 py-1 text-xs font-semibold text-[#2F6C56]">
                  已完成
                </span>
              ) : (
                <PointsBadge points={10} />
              )}
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => router.push("/followup")}
                className="rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white"
              >
                {state.followupConfirmed ? "查看回复" : "去确认"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/notifications")}
                className="rounded-full border border-line bg-cream px-5 py-2.5 text-sm font-semibold text-navy"
              >
                看通知
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="今天看一个小课">
          <div className="rounded-[24px] bg-[#FFF8ED] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-navy">
                  {featuredCourse.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-navy/68">
                  {featuredCourse.duration}，看完 +{featuredCourse.points} 分
                </p>
              </div>
              <PointsBadge points={featuredCourse.points} />
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() =>
                  router.push(`/courses?autoplay=${featuredCourse.id}&mode=play`)
                }
                className="rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white"
              >
                播放
              </button>
              <button
                type="button"
                onClick={() =>
                  router.push(`/courses?autoplay=${featuredCourse.id}&mode=listen`)
                }
                className="rounded-full border border-line bg-cream px-5 py-2.5 text-sm font-semibold text-navy"
              >
                听讲解
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}

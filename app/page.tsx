"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  HeartPulse,
  Pill,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { contacts } from "@/data/contacts";
import { courses } from "@/data/courses";
import { tasks } from "@/data/tasks";
import { ContactAvatar } from "@/components/ContactAvatar";
import { PhoneShell } from "@/components/PhoneShell";
import { PointsBadge } from "@/components/PointsBadge";
import { PrimaryClawCard } from "@/components/PrimaryClawCard";
import { SectionCard } from "@/components/SectionCard";
import { TaskCard } from "@/components/TaskCard";
import { TopBar } from "@/components/TopBar";
import { useToast } from "@/components/ToastProvider";
import { getNextFollowupLabel } from "@/lib/format";
import {
  ensureSeedNotifications,
  getLocalUnreadNotificationCount,
  getTodayKey,
  readDoctorTodos,
  readMatchedLeader,
  STORAGE_CHANGE_EVENT,
} from "@/lib/storage";
import { resolveInitialUser } from "@/lib/onboarding";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AppRole, DemoUser } from "@/lib/types";
import { useClawState } from "@/lib/useClawState";

const previewTaskIcons = [Pill, HeartPulse, ClipboardCheck];
const keyContactIds = ["li-doctor", "wang-nurse", "chen-pharmacist", "daughter"];

const roleHomeConfig: Partial<
  Record<
    AppRole,
    {
      title: string;
      subtitle: string;
      cta: string;
      href: string;
      items: { title: string; description: string; icon: typeof ClipboardCheck }[];
    }
  >
> = {
  family: {
    title: "家属协助首页",
    subtitle: "帮老人查看提醒、联系家医团队，少走弯路。",
    cta: "进入家属协助",
    href: "/family",
    items: [
      { title: "我绑定的老人", description: "查看老人姓名和协助关系。", icon: Users },
      { title: "老人今日任务情况", description: "了解今天哪些健康小事需要帮忙。", icon: ClipboardCheck },
      { title: "老人待处理提醒", description: "随访、体检、课程提醒先看这里。", icon: HeartPulse },
      { title: "帮老人问 Claw", description: "流程和服务问题可以先帮老人问。", icon: BookOpen },
      { title: "联系家医团队", description: "医生、护士、药师和社区支持入口。", icon: UserRoundPlus },
    ],
  },
  doctor: {
    title: "医生工作台首页",
    subtitle: "聚焦待处理问题和高风险提醒。",
    cta: "进入医生工作台",
    href: "/doctor",
    items: [
      { title: "待处理问题", description: "查看需要医生判断的问题。", icon: ClipboardCheck },
      { title: "高风险提醒", description: "优先处理高风险咨询和异常线索。", icon: HeartPulse },
      { title: "今日 FAQ 已分流", description: "了解被标准问答接住的问题。", icon: BookOpen },
      { title: "居民任务异常", description: "关注连续未打卡和随访未确认。", icon: Activity },
    ],
  },
  nurse: {
    title: "护士工作台首页",
    subtitle: "随访、记录异常和健康任务协助。",
    cta: "进入护士工作台",
    href: "/doctor",
    items: [
      { title: "随访提醒", description: "查看待确认和待回访事项。", icon: ClipboardCheck },
      { title: "血压血糖记录异常", description: "关注连续异常或缺失记录。", icon: HeartPulse },
      { title: "健康任务协助", description: "协助居民完成日常健康小事。", icon: Activity },
    ],
  },
  pharmacist: {
    title: "药师工作台首页",
    subtitle: "配药规则、用药说明和续方咨询。",
    cta: "进入药师工作台",
    href: "/doctor",
    items: [
      { title: "配药规则咨询", description: "解释社区配药和医院配药流程。", icon: Pill },
      { title: "用药说明待处理", description: "整理常见用药说明和注意事项。", icon: BookOpen },
      { title: "长处方/延伸处方问题", description: "协助居民理解续方规则。", icon: ClipboardCheck },
    ],
  },
  community: {
    title: "社区协助首页",
    subtitle: "通知、登记、小组长匹配和操作协助。",
    cta: "进入社区协助工作台",
    href: "/doctor",
    items: [
      { title: "体检通知协助", description: "帮助居民查看体检和登记通知。", icon: ClipboardCheck },
      { title: "健康云/小程序操作协助", description: "协助不太会用手机的居民。", icon: UserRoundPlus },
      { title: "小组长匹配", description: "帮助居民找到合适的小组长。", icon: Users },
      { title: "社区动员任务", description: "查看需要社区支持的任务。", icon: Activity },
    ],
  },
  admin: {
    title: "管理员运营首页",
    subtitle: "内容管理、运行看板和反馈管理。",
    cta: "进入管理后台",
    href: "/admin",
    items: [
      { title: "管理后台", description: "进入完整运营管理页面。", icon: ClipboardCheck },
      { title: "FAQ 管理", description: "维护标准问答和分流内容。", icon: BookOpen },
      { title: "小课堂管理", description: "更新健康教育内容。", icon: HeartPulse },
      { title: "任务与积分管理", description: "维护任务模板和积分规则。", icon: Activity },
      { title: "运行看板", description: "查看提问、分流、反馈等数据。", icon: Users },
    ],
  },
};

function RoleHomeCards({ user, onOpen }: { user: DemoUser; onOpen: (href: string) => void }) {
  const config = roleHomeConfig[user.role];

  if (!config) {
    return null;
  }

  return (
    <>
      <SectionCard>
        <div className="rounded-[26px] bg-surface-card p-5">
          <p className="text-xl font-semibold text-navy">{config.title}</p>
          <p className="mt-2 text-sm leading-6 text-navy/66">{config.subtitle}</p>
          <button
            type="button"
            onClick={() => onOpen(config.href)}
            className="mt-5 w-full rounded-full bg-navy px-4 py-4 text-base font-semibold text-white"
          >
            {config.cta}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="常用入口">
        <div className="space-y-3">
          {config.items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.title}
                type="button"
                onClick={() => onOpen(config.href)}
                className="flex w-full items-start gap-3 rounded-[22px] border border-line/60 bg-surface-card px-4 py-4 text-left active:scale-[0.98]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-health-muted text-sage">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-navy">{item.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-navy/58">
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>
    </>
  );
}

export default function HomePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { showToast } = useToast();
  const { state, completeTask, completeGroupCheckIn } = useClawState();
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [pendingTodoCount, setPendingTodoCount] = useState(0);
  const [matchedLeaderName, setMatchedLeaderName] = useState<string | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function bootstrapIdentity() {
      const user = await resolveInitialUser(supabase);

      if (!active) {
        return;
      }

      setCurrentUser(user);
      setIdentityLoading(false);

      if (!user) {
        router.replace("/welcome");
      }
    }

    void bootstrapIdentity();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    function refresh() {
      ensureSeedNotifications();
      const todos = readDoctorTodos();
      setPendingTodoCount(
        todos.filter((todo) => todo.status === "pending" || todo.status === "processing").length,
      );
      const matched = readMatchedLeader();
      setMatchedLeaderName(matched?.leaderName ?? null);
      setUnreadNotificationCount(getLocalUnreadNotificationCount());
    }

    refresh();

    fetch("/api/notifications?unreadOnly=true&limit=100")
      .then((res) => res.json())
      .then((data: { ok?: boolean; notifications?: unknown[] }) => {
        if (data.ok && data.notifications) {
          setUnreadNotificationCount(data.notifications.length);
        }
      })
      .catch(() => {});

    window.addEventListener(STORAGE_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [currentUser]);

  const quickContacts = contacts.filter((contact) => keyContactIds.includes(contact.id));
  const previewTasks = tasks.slice(0, 3);
  const featuredCourse = courses[0];
  const previewCompletedCount = previewTasks.filter((task) =>
    state.completedTaskIds.includes(task.id),
  ).length;

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

  if (identityLoading) {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8 pt-8">
          <SectionCard>
            <p className="text-sm text-navy/66">正在读取当前身份...</p>
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  if (!currentUser) {
    return (
      <PhoneShell>
        <div className="flex min-h-full items-center px-4 py-8">
          <SectionCard>
            <div className="rounded-[24px] bg-surface-card p-5 text-center">
              <p className="text-xl font-semibold text-navy">请先选择身份</p>
              <p className="mt-3 text-sm leading-6 text-navy/64">
                家医 Claw 会根据您的身份显示合适的服务入口。
              </p>
              <button
                type="button"
                onClick={() => router.push("/welcome")}
                className="mt-5 w-full rounded-full bg-navy px-4 py-4 text-base font-semibold text-white"
              >
                开始使用
              </button>
            </div>
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <TopBar
          points={state.points}
          hasUnreadNotifications={unreadNotificationCount > 0}
          onBellClick={() => router.push("/notifications")}
        />

        <div className="ios-control rounded-[24px] px-4 py-3">
          <p className="text-sm font-semibold text-navy">
            {currentUser.name} / {currentUser.roleLabel}
          </p>
          <p className="mt-1 text-xs leading-5 text-navy/56">
            当前会按这个身份显示服务入口，可在“我的”中修改。
          </p>
        </div>

        <SectionCard>
          <div className="rounded-[24px] border border-line/55 bg-surface-card px-4 py-4">
            <p className="text-sm font-semibold text-navy">演示中心已就绪</p>
            <p className="mt-1 text-xs leading-5 text-navy/58">
              可一页查看所有页面入口、推荐讲解路线，并一键重置演示数据。
            </p>
            <button
              type="button"
              onClick={() => router.push("/demo-center")}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white"
            >
              打开演示中心
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </SectionCard>

        {currentUser.role !== "resident" ? (
          <RoleHomeCards user={currentUser} onOpen={(href) => router.push(href)} />
        ) : (
          <>

        <SectionCard title="今日提醒">
          <div className="rounded-[26px] border border-white/55 bg-[linear-gradient(145deg,rgba(250,238,219,0.95),rgba(255,248,237,0.82))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/55 text-navy shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <ClipboardCheck className="h-5 w-5" strokeWidth={2.1} />
                </div>
                <div>
                  <p className="text-base font-semibold text-navy">
                    {state.followupConfirmed ? "本周随访已确认" : `${getNextFollowupLabel()} 有随访确认`}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-navy/62">
                    {state.followupConfirmed
                      ? `您已回复：${state.followupResponse ?? "可以按时参加"}`
                      : `${contacts.find((c) => c.id === "wang-nurse")?.name ?? "王护士"}想确认您本周慢病随访是否方便参加。`}
                  </p>
                  {pendingTodoCount > 0 ? (
                    <p className="mt-2 text-xs leading-5 text-amber">
                      家医团队还有 {pendingTodoCount} 条提醒正在跟进。
                    </p>
                  ) : null}
                </div>
              </div>
              {state.followupConfirmed ? (
                <span className="rounded-full bg-health-success px-3 py-1 text-xs font-semibold text-success">
                  已确认
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
                看提醒
              </button>
            </div>
          </div>
        </SectionCard>

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
              查看全部任务
              <ChevronRight className="h-4 w-4" />
            </button>
          }
        >
          <div className="mb-4 flex items-center justify-between rounded-[24px] border border-white/55 bg-surface-tint px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)]">
            <div>
              <p className="text-xs text-navy/55">今天先完成这 3 件</p>
              <p className="mt-1 text-lg font-semibold text-navy">
                已完成 {previewCompletedCount}/3
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-sage/30 bg-white/35">
              <span className="text-xs font-bold text-sage">
                {Math.round((previewCompletedCount / 3) * 100)}%
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
                icon={previewTaskIcons[index] ?? BookOpen}
                completed={state.completedTaskIds.includes(task.id)}
                onComplete={() => {
                  const changed = completeTask(task.id, task.points, task.title);
                  showToast(
                    changed ? `已完成，积分 +${task.points}` : "这件事今天已经完成了",
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
            不知道找谁时，可以先从这里进入。
          </p>
          <div className="grid grid-cols-4 gap-y-4">
            {quickContacts.map((contact) => (
              <ContactAvatar key={contact.id} contact={contact} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="健康小组">
          <div className="rounded-[26px] border border-white/50 bg-surface-tintSoft p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-semibold text-navy">高血压互助小组</p>
              <span className="flex items-center gap-1.5 rounded-full bg-sage/15 px-3 py-1 text-xs font-semibold text-sage">
                <Users className="h-3.5 w-3.5" />
                今日 {8 + (state.groupCheckInDates.includes(getTodayKey()) ? 1 : 0)} 人打卡
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-navy/68">
              组长：{matchedLeaderName ?? "王阿姨"}。最新提醒：今天记得量一次血压。
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
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
              <button
                type="button"
                onClick={() => router.push("/match-leader")}
                className="flex items-center gap-1.5 rounded-full border border-sage/30 bg-health-soft px-4 py-2.5 text-sm font-semibold text-sage active:scale-95"
              >
                <UserRoundPlus className="h-4 w-4" />
                {matchedLeaderName ? "重新匹配" : "找小组长"}
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="我的家属 / 小组长入口">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => router.push("/contacts")}
              className="rounded-[22px] border border-line bg-surface-card px-4 py-4 text-left active:scale-[0.98]"
            >
              <Users className="h-5 w-5 text-sage" />
              <p className="mt-3 text-sm font-semibold text-navy">我的家属</p>
              <p className="mt-1 text-xs leading-5 text-navy/58">查看家人联系人和协助入口。</p>
            </button>
            <button
              type="button"
              onClick={() => router.push("/match-leader")}
              className="rounded-[22px] border border-line bg-surface-card px-4 py-4 text-left active:scale-[0.98]"
            >
              <UserRoundPlus className="h-5 w-5 text-sage" />
              <p className="mt-3 text-sm font-semibold text-navy">我的小组长</p>
              <p className="mt-1 text-xs leading-5 text-navy/58">匹配或查看社区健康小组长。</p>
            </button>
          </div>
        </SectionCard>

        <SectionCard title="小课堂推荐">
          <div className="rounded-[26px] border border-line/45 bg-surface-card p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-navy">{featuredCourse.title}</p>
                <p className="mt-2 text-sm leading-6 text-navy/68">
                  {featuredCourse.duration}，看完 +{featuredCourse.points} 分
                </p>
              </div>
              <PointsBadge points={featuredCourse.points} />
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => router.push(`/courses?autoplay=${featuredCourse.id}&mode=play`)}
                className="rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white"
              >
                播放
              </button>
              <button
                type="button"
                onClick={() => router.push(`/courses?autoplay=${featuredCourse.id}&mode=listen`)}
                className="rounded-full border border-line bg-cream px-5 py-2.5 text-sm font-semibold text-navy"
              >
                听讲解
              </button>
            </div>
          </div>
        </SectionCard>
          </>
        )}
      </div>
    </PhoneShell>
  );
}

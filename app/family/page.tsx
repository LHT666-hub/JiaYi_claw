"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Award,
  Bell,
  ClipboardList,
  HeartPulse,
  MessageCircleMore,
  Phone,
  Users,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { ContactAvatar } from "@/components/ContactAvatar";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { contacts } from "@/data/contacts";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { mapLocalTodoToProgress } from "@/lib/serviceProgress";
import { DemoUser, FamilyBindingView, ResidentTodoProgressItem } from "@/lib/types";
import { isAccountUser, resolveInitialUser } from "@/lib/onboarding";
import {
  STORAGE_CHANGE_EVENT,
  getFamilyBindingsForFamily,
  getTodoStatusEvents,
  readDoctorTodos,
  readMatchedLeader,
  readMergedTasks,
  readPointsSummary,
  readState,
} from "@/lib/storage";

const quickContactIds = ["li-doctor", "wang-nurse", "chen-pharmacist", "lou-leader"];
type FamilyResidentSummary = {
  residentId: string;
  residentName: string;
  totalPoints: number;
  completedTaskCountToday: number;
  pendingTodoCount: number;
  groupCheckInCountToday: number;
  followupConfirmed: boolean;
  followupResponse: string | null;
};

export default function FamilyPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bindings, setBindings] = useState<FamilyBindingView[]>([]);
  const [progressItems, setProgressItems] = useState<ResidentTodoProgressItem[]>([]);
  const [remoteLeaderName, setRemoteLeaderName] = useState<string | null>(null);
  const [residentSummaries, setResidentSummaries] = useState<Record<string, FamilyResidentSummary>>({});
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const usingAccount = isAccountUser(currentUser);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const user = await resolveInitialUser(supabase);
      if (!active) {
        return;
      }

      setCurrentUser(user);
      setIsLoading(false);

      if (!user) {
        router.replace("/welcome");
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "family") {
      return;
    }

    const familyUser = currentUser;
    let active = true;

    async function loadBindings() {
      if (!usingAccount) {
        const fallback = getFamilyBindingsForFamily(familyUser.id);
        setBindings(fallback);
        setResidentSummaries({});
        const todos = readDoctorTodos();
        setProgressItems(
          todos.map((todo) =>
            mapLocalTodoToProgress({
              todo,
              statusEvents: getTodoStatusEvents(todo.id),
            }),
          ),
        );
      } else {
        setBindings([]);
        setProgressItems([]);
        setResidentSummaries({});
        setRemoteError(null);
      }

      try {
        const leaderResponse = await fetch("/api/leaders/selected", { method: "GET", cache: "no-store" });
        const leaderPayload = (await leaderResponse.json().catch(() => ({}))) as {
          leader?: { name?: string | null } | null;
        };
        if (active && leaderResponse.ok) {
          setRemoteLeaderName(leaderPayload.leader?.name ?? null);
        }

        const response = await fetch("/api/family/bindings", { method: "GET", cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          bindings?: FamilyBindingView[];
        };
        if (active && response.ok && payload.bindings?.length) {
          setBindings(payload.bindings);
        }

        const summaryResponse = await fetch("/api/home/summary", { method: "GET", cache: "no-store" });
        const summaryPayload = (await summaryResponse.json().catch(() => ({}))) as {
          summaries?: FamilyResidentSummary[];
        };
        if (active && summaryResponse.ok) {
          setResidentSummaries(
            Object.fromEntries(
              (summaryPayload.summaries ?? []).map((item) => [item.residentId, item]),
            ) as Record<string, FamilyResidentSummary>,
          );
          setRemoteError(null);
        }

        const todoResponse = await fetch("/api/resident/todos", { method: "GET", cache: "no-store" });
        const todoPayload = (await todoResponse.json().catch(() => ({}))) as {
          todos?: ResidentTodoProgressItem[];
        };
        if (active && todoResponse.ok) {
          setProgressItems(todoPayload.todos ?? []);
        }
      } catch {
        if (active && usingAccount) {
          setRemoteError("当前账号的家属绑定和老人健康汇总暂时还没同步成功，请稍后刷新再试。");
        }
      }
    }

    void loadBindings();

    if (usingAccount) {
      return () => {
        active = false;
      };
    }

    function handleStorageChange() {
      setBindings(getFamilyBindingsForFamily(familyUser.id));
      const todos = readDoctorTodos();
      setProgressItems(
        todos.map((todo) =>
          mapLocalTodoToProgress({
            todo,
            statusEvents: getTodoStatusEvents(todo.id),
          }),
        ),
      );
    }

    window.addEventListener(STORAGE_CHANGE_EVENT, handleStorageChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      active = false;
      window.removeEventListener(STORAGE_CHANGE_EVENT, handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [currentUser, usingAccount]);

  const state = usingAccount ? null : readState();
  const taskTotal = readMergedTasks().length;
  const pointSummary = usingAccount ? null : readPointsSummary();
  const matchedLeader = usingAccount
    ? remoteLeaderName
      ? { leaderName: remoteLeaderName }
      : null
    : readMatchedLeader();
  const quickContacts = contacts.filter((contact) => quickContactIds.includes(contact.id));

  function getResidentStats(binding: FamilyBindingView) {
    const todos = progressItems.filter(
      (todo) =>
        (binding.residentId && todo.residentId === binding.residentId) ||
        todo.residentName === binding.residentName,
    );
    const pendingTodos = todos.filter((todo) => todo.status === "pending" || todo.status === "processing");
    const latestTodo = todos[0];

    return {
      completedText: usingAccount
        ? `${residentSummaries[binding.residentId]?.completedTaskCountToday ?? 0}/${taskTotal}`
        : `${state?.completedTaskIds.length ?? 0}/${taskTotal}`,
      pointsText: usingAccount
        ? `${residentSummaries[binding.residentId]?.totalPoints ?? 0} 分`
        : `${pointSummary?.current ?? 0} 分`,
      pendingCount: usingAccount
        ? residentSummaries[binding.residentId]?.pendingTodoCount ?? pendingTodos.length
        : pendingTodos.length,
      latestStatus: usingAccount
        ? residentSummaries[binding.residentId]?.followupConfirmed
          ? `已回复随访：${residentSummaries[binding.residentId]?.followupResponse ?? "可以按时参加"}`
          : latestTodo
            ? latestTodo.status === "done"
              ? "家医团队已更新处理状态"
              : latestTodo.status === "processing"
                ? "家医团队正在处理"
                : latestTodo.status === "ignored"
                  ? "最近一条服务已关闭"
                  : "已提交给家医团队"
            : "目前没有需要家医团队处理的问题。"
        : latestTodo
        ? latestTodo.status === "done"
          ? "家医团队已更新处理状态"
          : latestTodo.status === "processing"
            ? "家医团队正在处理"
            : latestTodo.status === "ignored"
              ? "最近一条服务已关闭"
              : "已提交给家医团队"
        : "目前没有需要家医团队处理的问题。",
    };
  }

  if (isLoading) {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="家属协助" subtitle="正在读取当前身份..." />
        </div>
      </PhoneShell>
    );
  }

  if (!currentUser) {
    return null;
  }

  if (currentUser.role !== "family") {
    return (
      <PhoneShell showBottomNav>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="家属协助" subtitle="当前页面适合家属协助老人使用。" />
          <SectionCard>
            <div className="rounded-[24px] bg-surface-card p-5 text-center">
              <p className="text-lg font-semibold text-navy">当前身份暂无家属端权限</p>
              <p className="mt-3 text-sm leading-6 text-navy/64">
                您可以回到首页继续使用，也可以重新选择身份。
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="flex-1 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white"
                >
                  返回首页
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/welcome")}
                  className="flex-1 rounded-full border border-line bg-cream px-4 py-3 text-sm font-semibold text-navy"
                >
                  重新选择
                </button>
              </div>
            </div>
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="家属协助" subtitle={`${currentUser.name} / ${currentUser.roleLabel}`} />

        {usingAccount && remoteError ? (
          <SectionCard>
            <div className="rounded-[22px] border border-amber/25 bg-[#FFF6EA] px-4 py-4">
              <p className="text-sm font-semibold text-navy">数据同步稍有延迟</p>
              <p className="mt-1 text-sm leading-6 text-navy/66">{remoteError}</p>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard>
          <div className="rounded-[24px] bg-surface-card p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-health-muted text-sage">
                <HeartPulse className="h-7 w-7" />
              </div>
              <div>
                <p className="text-lg font-semibold text-navy">您好，{currentUser.name}</p>
                <p className="mt-2 text-sm leading-6 text-navy/66">
                  已绑定 {bindings.filter((item) => item.status !== "disabled").length} 位老人。这里主要用于查看提醒、任务和服务进度。
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="我绑定的老人">
          {bindings.length ? (
            <div className="space-y-3">
              {bindings.map((binding) => {
                const stats = getResidentStats(binding);
                return (
                  <div key={binding.id} className="rounded-[22px] border border-line/60 bg-surface-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-navy">{binding.residentName}</p>
                        <p className="mt-1 text-xs text-navy/56">
                          {binding.relationship} / {binding.isPrimary ? "主要联系人" : "家属联系人"} /{" "}
                          {binding.status === "active" ? "有效" : binding.status === "pending" ? "待确认" : "已停用"}
                        </p>
                      </div>
                      <Users className="h-5 w-5 text-sage" />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-[18px] bg-cream px-3 py-3">
                        <ClipboardList className="mb-2 h-4 w-4 text-sage" />
                        <p className="text-xs text-navy/54">今日任务</p>
                        <p className="mt-1 text-sm font-semibold text-navy">{stats.completedText}</p>
                      </div>
                      <div className="rounded-[18px] bg-cream px-3 py-3">
                        <Award className="mb-2 h-4 w-4 text-amber" />
                        <p className="text-xs text-navy/54">当前积分</p>
                        <p className="mt-1 text-sm font-semibold text-navy">{stats.pointsText}</p>
                      </div>
                      <div className="rounded-[18px] bg-cream px-3 py-3">
                        <AlertTriangle className="mb-2 h-4 w-4 text-amber" />
                        <p className="text-xs text-navy/54">待处理提醒</p>
                        <p className="mt-1 text-sm font-semibold text-navy">{stats.pendingCount} 条</p>
                      </div>
                      <div className="rounded-[18px] bg-cream px-3 py-3">
                        <HeartPulse className="mb-2 h-4 w-4 text-sage" />
                        <p className="text-xs text-navy/54">服务状态</p>
                        <p className="mt-1 text-sm font-semibold text-navy">{stats.latestStatus}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => router.push("/tasks")}
                        className="rounded-full bg-navy px-3 py-2.5 text-xs font-semibold text-white"
                      >
                        查看老人健康任务
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`/service-progress?residentId=${binding.residentId}`)}
                        className="rounded-full border border-line bg-cream px-3 py-2.5 text-xs font-semibold text-navy"
                      >
                        查看老人服务进度
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[22px] bg-surface-card p-5 text-sm leading-6 text-navy/66">
              还没有绑定老人。请联系管理员或家医团队完成绑定后再查看。
            </div>
          )}
        </SectionCard>

        <SectionCard title="常用入口">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => router.push("/contacts")}
              className="flex w-full items-center gap-3 rounded-[22px] bg-surface-card px-4 py-4 text-left active:scale-[0.98]"
            >
              <Phone className="h-5 w-5 text-sage" />
              <span>
                <span className="block text-sm font-semibold text-navy">一键找人</span>
                <span className="mt-1 block text-xs leading-5 text-navy/58">
                  不确定找谁时，可以先从医生、护士、药师或社区支持里选。
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => router.push("/ask")}
              className="flex w-full items-center gap-3 rounded-[22px] bg-surface-card px-4 py-4 text-left active:scale-[0.98]"
            >
              <MessageCircleMore className="h-5 w-5 text-amber" />
              <span>
                <span className="block text-sm font-semibold text-navy">帮老人问 Claw</span>
                <span className="mt-1 block text-xs leading-5 text-navy/58">
                  可以先问服务导航、提醒和联系谁，不替医生做判断。
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => router.push("/match-leader")}
              className="flex w-full items-center gap-3 rounded-[22px] bg-surface-card px-4 py-4 text-left active:scale-[0.98]"
            >
              <Users className="h-5 w-5 text-sage" />
              <span>
                <span className="block text-sm font-semibold text-navy">查看小组长</span>
                <span className="mt-1 block text-xs leading-5 text-navy/58">
                  当前小组长：{matchedLeader?.leaderName ?? "暂未匹配"}。
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => router.push("/notifications")}
              className="flex w-full items-center gap-3 rounded-[22px] bg-surface-card px-4 py-4 text-left active:scale-[0.98]"
            >
              <Bell className="h-5 w-5 text-amber" />
              <span>
                <span className="block text-sm font-semibold text-navy">通知中心</span>
                <span className="mt-1 block text-xs leading-5 text-navy/58">
                  查看老人相关提醒、服务进度和家医团队处理更新。
                </span>
              </span>
            </button>
          </div>
        </SectionCard>

        <SectionCard title="常用联系人">
          <div className="grid grid-cols-4 gap-y-4">
            {quickContacts.map((contact) => (
              <ContactAvatar key={contact.id} contact={contact} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="身份信息">
          <div className="rounded-[22px] bg-surface-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy text-lg font-semibold text-white">
                {currentUser.name.slice(0, 1)}
              </div>
              <div>
                <p className="text-sm font-semibold text-navy">{currentUser.name}</p>
                <p className="mt-1 text-xs text-navy/56">
                  <Users className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                  {currentUser.roleLabel}
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        <p className="rounded-[20px] bg-surface-card px-4 py-3 text-xs leading-5 text-navy/58">
          家属端用于协助老人查看提醒、任务和服务进度，不提供诊断、处方、停药、换药或剂量调整建议。涉及病情、报告异常或用药问题，请联系家庭医生或线下医生。
        </p>
      </div>
    </PhoneShell>
  );
}

"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChevronRight,
  ClipboardList,
  MessageSquareText,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
import { PhoneShell } from "@/components/PhoneShell";
import { PointsBadge } from "@/components/PointsBadge";
import { SectionCard } from "@/components/SectionCard";
import { contacts as localContacts } from "@/data/contacts";
import {
  STORAGE_CHANGE_EVENT,
  getTodayKey,
  readDoctorTodos,
  readFamilyBindings,
  readMatchedLeader,
  readMergedTasks,
  readPointsSummary,
  getTodoStatusEvents,
} from "@/lib/storage";
import { clearCurrentUser, saveCurrentUser } from "@/lib/onboarding";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { mapLocalTodoToProgress } from "@/lib/serviceProgress";
import { buildResidentFriendlyTaskSnapshot } from "@/lib/agentTaskPayload";
import { fetchCurrentProfile, getRoleLabel, isWorkbenchRole } from "@/lib/supabase/mvp";
import {
  ContactItem,
  DemoDoctorTodo,
  FamilyBindingView,
  MatchedLeaderRecord,
  ProfileRow,
  ResidentTodoProgressItem,
} from "@/lib/types";
import { useClawState } from "@/lib/useClawState";
import { logout, useDemoUser } from "@/lib/useDemoUser";
import { useToast } from "@/components/ToastProvider";

type AuthMode = "loading" | "real" | "demo" | "none";
type ResidentHomeSummary = {
  residentId: string;
  residentName: string;
  totalPoints: number;
  completedTaskIdsToday: string[];
  completedTaskCountToday: number;
  pendingTodoCount: number;
  groupCheckInCountToday: number;
};

function ActionRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-[22px] bg-surface-card px-4 py-4 text-left transition active:scale-[0.98] active:bg-surface-press"
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm font-semibold text-navy">{label}</span>
      </div>
      <ChevronRight className="h-4 w-4 text-navy/45" />
    </button>
  );
}

function SimpleContactCard({
  name,
  roleLabel,
  avatarUrl,
}: {
  name: string;
  roleLabel: string;
  avatarUrl?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-[22px] bg-surface-card px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="relative h-12 w-12 overflow-hidden rounded-full border border-white/60 bg-surface-avatar shadow-soft">
          {avatarUrl ? <Image src={avatarUrl} alt={name} fill sizes="48px" className="object-cover" /> : null}
        </div>
        <div>
          <p className="text-sm font-semibold text-navy">{name}</p>
          <p className="mt-1 text-xs text-navy/56">{roleLabel}</p>
        </div>
      </div>
      <Users className="h-4 w-4 text-sage" />
    </div>
  );
}

const statusLabelMap: Record<string, string> = {
  pending: "已提交给家医团队",
  processing: "家医团队正在处理",
  done: "已处理",
  ignored: "已关闭",
};

export default function MePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { currentUser: demoUser, isReady: demoUserReady } = useDemoUser();
  const { state } = useClawState();
  const { showToast } = useToast();
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [myTodos, setMyTodos] = useState<DemoDoctorTodo[]>([]);
  const [matchedLeader, setMatchedLeader] = useState<MatchedLeaderRecord | null>(null);
  const [familyBindings, setFamilyBindings] = useState<FamilyBindingView[]>([]);
  const [serviceTodos, setServiceTodos] = useState<ResidentTodoProgressItem[]>([]);
  const [realHomeSummary, setRealHomeSummary] = useState<ResidentHomeSummary | null>(null);
  const [familyResidentSummaries, setFamilyResidentSummaries] = useState<
    Record<string, ResidentHomeSummary>
  >({});
  const [contactItems, setContactItems] = useState<ContactItem[]>(localContacts);
  const [basicForm, setBasicForm] = useState({ name: "", phone: "", area: "" });
  const [isSavingBasic, setIsSavingBasic] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const role = authMode === "real" ? profile?.role : demoUser?.role;

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (isSupabaseConfigured() && supabase) {
        const currentProfile = await fetchCurrentProfile(supabase);

        if (!active) {
          return;
        }

        if (currentProfile) {
          setProfile(currentProfile);
          setAuthMode("real");
          return;
        }
      }

      if (!demoUserReady) {
        return;
      }

      if (demoUser) {
        setAuthMode("demo");
        return;
      }

      setAuthMode("none");
      router.replace("/welcome");
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [demoUser, demoUserReady, router, supabase]);

  useEffect(() => {
    if (authMode !== "demo" || !demoUser) {
      setMyTodos([]);
      setMatchedLeader(null);
      setFamilyBindings([]);
      setServiceTodos([]);
      setContactItems(localContacts);
      return;
    }

    const localDemoUser = demoUser;

    function loadLocalRecords() {
      const localTodos = readDoctorTodos();
      setMyTodos(localTodos);
      setMatchedLeader(readMatchedLeader());
      setFamilyBindings(readFamilyBindings());
      setContactItems(localContacts);
      if (localDemoUser.role === "resident") {
        setServiceTodos(
          localTodos
            .filter(
              (todo) =>
                todo.residentId === localDemoUser.id || todo.residentName === localDemoUser.name,
            )
            .map((todo) =>
              mapLocalTodoToProgress({
                todo,
                statusEvents: getTodoStatusEvents(todo.id),
              }),
            ),
        );
      } else {
        setServiceTodos([]);
      }
    }

    loadLocalRecords();
    window.addEventListener(STORAGE_CHANGE_EVENT, loadLocalRecords);
    window.addEventListener("storage", loadLocalRecords);

    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, loadLocalRecords);
      window.removeEventListener("storage", loadLocalRecords);
    };
  }, [authMode, demoUser]);

  useEffect(() => {
    if (authMode === "real" && profile) {
      setBasicForm({
        name: profile.display_name ?? "",
        phone: profile.phone ?? "",
        area: "",
      });
      return;
    }

    if (authMode === "demo" && demoUser) {
      setBasicForm({
        name: demoUser.name,
        phone: demoUser.phone ?? "",
        area: demoUser.area ?? "",
      });
    }
  }, [authMode, demoUser, profile]);

  useEffect(() => {
    if (authMode !== "real") {
      setRealHomeSummary(null);
      setFamilyResidentSummaries({});
      return;
    }

    let active = true;

    async function loadHomeSummary() {
      try {
        const response = await fetch("/api/home/summary", { method: "GET", cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          summary?: ResidentHomeSummary | null;
          summaries?: ResidentHomeSummary[];
        };

        if (!active || !response.ok) {
          return;
        }

        if (role === "resident") {
          setRealHomeSummary(payload.summary ?? null);
          setRemoteError(null);
          return;
        }

        if (role === "family") {
          const nextSummaries = Object.fromEntries(
            (payload.summaries ?? []).map((item) => [item.residentId, item]),
          ) as Record<string, ResidentHomeSummary>;
          setFamilyResidentSummaries(nextSummaries);
          setRemoteError(null);
          return;
        }

        setRealHomeSummary(null);
        setFamilyResidentSummaries({});
      } catch {
        if (!active) {
          return;
        }

        setRealHomeSummary(null);
        setFamilyResidentSummaries({});
        setRemoteError("当前账号的汇总信息暂时还没同步成功，请稍后刷新再试。");
      }
    }

    void loadHomeSummary();

    return () => {
      active = false;
    };
  }, [authMode, role]);

  useEffect(() => {
    if (authMode !== "real") {
      return;
    }

    let active = true;

    async function loadRemoteBindings() {
      try {
        const response = await fetch("/api/family/bindings", { method: "GET", cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          bindings?: FamilyBindingView[];
        };
        if (active && response.ok && payload.bindings?.length) {
          setFamilyBindings(payload.bindings);
        }
      } catch {
        if (active) {
          setFamilyBindings([]);
        }
      }
    }

    void loadRemoteBindings();

    return () => {
      active = false;
    };
  }, [authMode]);

  useEffect(() => {
    if (authMode !== "real") {
      return;
    }

    let active = true;

    async function loadSelectedLeader() {
      try {
        const response = await fetch("/api/leaders/selected", { method: "GET", cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          leader?: {
            id?: string;
            name?: string | null;
            matchPercent?: number | null;
            reasons?: string[];
          } | null;
        };

        if (!active) {
          return;
        }

        if (response.ok && payload.leader?.name) {
          setMatchedLeader({
            leaderId: payload.leader.id ?? "remote-selected-leader",
            leaderName: payload.leader.name,
            matchPercent: payload.leader.matchPercent ?? 0,
            matchReasons: payload.leader.reasons ?? [],
            matchedAt: new Date().toISOString(),
          });
        } else {
          setMatchedLeader(null);
        }
      } catch {
        if (active) {
          setMatchedLeader(null);
        }
      }
    }

    void loadSelectedLeader();

    return () => {
      active = false;
    };
  }, [authMode]);

  useEffect(() => {
    if (authMode !== "real") {
      return;
    }

    if (role !== "resident") {
      return;
    }

    let active = true;

    async function loadServiceTodos() {
      try {
        const response = await fetch("/api/resident/todos", { method: "GET", cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          todos?: ResidentTodoProgressItem[];
        };
        if (active && response.ok) {
          setServiceTodos(payload.todos ?? []);
        }
      } catch {
        if (active) {
          setServiceTodos([]);
        }
      }
    }

    void loadServiceTodos();

    return () => {
      active = false;
    };
  }, [authMode, role]);

  useEffect(() => {
    if (authMode !== "real") {
      return;
    }

    let active = true;

    async function loadRemoteContacts() {
      try {
        const response = await fetch("/api/contacts", { method: "GET", cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          contacts?: ContactItem[];
        };

        if (!active) {
          return;
        }

        if (response.ok) {
          setContactItems(payload.contacts ?? []);
        } else {
          setContactItems([]);
        }
      } catch {
        if (active) {
          setContactItems([]);
        }
      }
    }

    void loadRemoteContacts();

    return () => {
      active = false;
    };
  }, [authMode]);

  const displayName = authMode === "real" ? profile?.display_name ?? "用户" : demoUser?.name ?? "用户";
  const roleLabel =
    authMode === "real"
      ? profile?.role
        ? getRoleLabel(profile.role)
        : "用户"
      : demoUser?.roleLabel ?? "居民";
  const description =
    authMode === "real"
      ? "当前显示已登录账号资料。"
      : demoUser?.description ?? "当前为本机身份。";
  const tags =
    authMode === "real"
      ? [roleLabel, profile?.phone ? `手机号：${profile.phone}` : "账号已登录"]
      : demoUser?.tags ?? [];
  const canOpenWorkbench = isWorkbenchRole(role);
  const canOpenAdmin = role === "admin";
  const visibleContacts = authMode === "real" ? contactItems : localContacts;
  const doctorTeam = visibleContacts.filter((contact) => contact.group === "doctorTeam");
  const familyMembers = visibleContacts.filter((contact) => contact.group === "family");
  const currentUserId = demoUser?.id ?? profile?.id ?? "";
  const taskTotal = readMergedTasks().length;
  const pointSummary = readPointsSummary();
  const residentBindings = familyBindings.filter((item) => item.residentId === currentUserId);
  const familyUserBindings = familyBindings.filter((item) => item.familyId === currentUserId);
  const pendingTodoCount = myTodos.filter(
    (todo) => todo.status === "pending" || todo.status === "processing",
  ).length;
  const displayedPoints =
    authMode === "real" && role === "resident"
      ? realHomeSummary?.totalPoints ?? 0
      : authMode === "real" && role === "family"
        ? familyResidentSummaries[familyUserBindings[0]?.residentId ?? ""]?.totalPoints ?? 0
      : state.points;
  const displayedGroupCheckInCount =
    authMode === "real" && role === "resident"
      ? realHomeSummary?.groupCheckInCountToday ?? 0
      : authMode === "real" && role === "family"
        ? familyResidentSummaries[familyUserBindings[0]?.residentId ?? ""]?.groupCheckInCountToday ?? 0
        : 8 + (state.groupCheckInDates.includes(getTodayKey()) ? 1 : 0);

  async function handleSaveBasic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!basicForm.name.trim()) {
      showToast("姓名不能为空。", "warning");
      return;
    }

    setIsSavingBasic(true);

    try {
      if (authMode === "real" && supabase && profile) {
        await supabase
          .from("profiles")
          .update({
            display_name: basicForm.name.trim(),
            phone: basicForm.phone.trim() || null,
          })
          .eq("id", profile.id);

        setProfile({
          ...profile,
          display_name: basicForm.name.trim(),
          phone: basicForm.phone.trim() || null,
        });
      }

      if (demoUser) {
        saveCurrentUser({
          ...demoUser,
          name: basicForm.name.trim(),
          phone: basicForm.phone.trim(),
          area: basicForm.area.trim(),
          tags: [
            demoUser.roleLabel,
            basicForm.area.trim() ? `片区：${basicForm.area.trim()}` : "已完成身份选择",
          ],
        });
      }

      showToast("基础信息已保存。", "success");
    } catch {
      showToast("暂时保存失败，请稍后再试。", "warning");
    } finally {
      setIsSavingBasic(false);
    }
  }

  function handleReselectIdentity() {
    clearCurrentUser();
    router.replace("/welcome");
  }

  async function handleLogout() {
    if (authMode === "real" && supabase) {
      await supabase.auth.signOut();
    }

    logout();
    router.replace("/welcome");
  }

  if (authMode === "loading") {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="我的" />
          <SectionCard>
            <p className="text-sm text-navy/66">正在读取当前身份...</p>
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  if (authMode === "none") {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="我的" />
          <SectionCard>
            <EmptyState
              title="当前未选择身份"
              description="请先选择您的身份，再查看“我的”页面。"
            />
            <button
              type="button"
              onClick={() => router.push("/welcome")}
              className="mt-4 w-full rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white"
            >
              开始选择
            </button>
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="我的" />

        {authMode === "real" && remoteError ? (
          <SectionCard>
            <div className="rounded-[22px] border border-amber/25 bg-[#FFF6EA] px-4 py-4">
              <p className="text-sm font-semibold text-navy">数据同步稍有延迟</p>
              <p className="mt-1 text-sm leading-6 text-navy/66">{remoteError}</p>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard>
          <div className="flex items-center gap-4">
            <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-line bg-[#12365A] text-3xl font-semibold text-white shadow-soft">
              {authMode === "real" && profile?.avatar_url ? (
                <Image src={profile.avatar_url} alt={displayName} fill sizes="80px" className="object-cover" />
              ) : (
                displayName.slice(0, 1)
              )}
            </div>
            <div>
              <h2 className="text-[1.5rem] font-semibold text-navy">{displayName}</h2>
              <p className="mt-1 text-sm text-navy/62">{roleLabel}</p>
              <p className="mt-2 text-sm leading-6 text-navy/68">{description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((tag, index) => (
                  <span
                    key={tag}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      index % 2 === 0 ? "bg-[#EAF1EF] text-sage" : "bg-[#FFF0DF] text-amber"
                    }`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="当前身份信息">
          <div className="space-y-3 rounded-[22px] bg-surface-card p-4 text-sm leading-6 text-navy/72">
            <p>
              <span className="font-semibold text-navy">身份：</span>
              {roleLabel}
            </p>
            <p>
              <span className="font-semibold text-navy">姓名：</span>
              {displayName}
            </p>
            <p>
              <span className="font-semibold text-navy">手机号：</span>
              {basicForm.phone || "未填写"}
            </p>
            <p>
              <span className="font-semibold text-navy">社区/片区：</span>
              {basicForm.area || "未填写"}
            </p>
          </div>
        </SectionCard>

        <SectionCard title="修改基础信息">
          <form onSubmit={handleSaveBasic} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-navy">姓名</span>
              <input
                value={basicForm.name}
                onChange={(event) =>
                  setBasicForm((current) => ({ ...current, name: event.target.value }))
                }
                className="h-12 w-full rounded-[18px] border border-line/70 bg-surface-card px-4 text-sm text-navy outline-none focus:border-sage focus:ring-1 focus:ring-sage/30"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-navy">手机号，可选</span>
              <input
                value={basicForm.phone}
                onChange={(event) =>
                  setBasicForm((current) => ({ ...current, phone: event.target.value }))
                }
                className="h-12 w-full rounded-[18px] border border-line/70 bg-surface-card px-4 text-sm text-navy outline-none focus:border-sage focus:ring-1 focus:ring-sage/30"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-navy">所在社区/片区，可选</span>
              <input
                value={basicForm.area}
                onChange={(event) =>
                  setBasicForm((current) => ({ ...current, area: event.target.value }))
                }
                className="h-12 w-full rounded-[18px] border border-line/70 bg-surface-card px-4 text-sm text-navy outline-none focus:border-sage focus:ring-1 focus:ring-sage/30"
              />
            </label>
            <button
              type="submit"
              disabled={isSavingBasic}
              className={`w-full rounded-full px-4 py-3 text-sm font-semibold text-white ${
                isSavingBasic ? "bg-navy/55" : "bg-navy"
              }`}
            >
              {isSavingBasic ? "正在保存..." : "保存基础信息"}
            </button>
          </form>
        </SectionCard>

        <SectionCard title="我的积分" action={<PointsBadge points={displayedPoints} />}>
          <p className="text-sm leading-6 text-navy/68">
            积分用于鼓励完成健康小事和参与小组互助，不能提现、不能买处方药。
          </p>
        </SectionCard>

        {role === "resident" ? (
          <SectionCard title="我的服务进度">
            {serviceTodos.length ? (
              <div className="space-y-3">
                {serviceTodos.slice(0, 3).map((todo) => (
                  <div key={todo.id} className="rounded-[22px] border border-line/60 bg-surface-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 text-sm font-semibold leading-6 text-navy line-clamp-2">
                        {todo.originalQuestion}
                      </p>
                      <span className="shrink-0 rounded-full border border-amber/20 bg-amber/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber">
                        {statusLabelMap[todo.status] ?? "待处理"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-navy/56">
                      建议联系谁：{todo.recommendedRoleLabel ?? "家庭医生"}
                    </p>
                    {todo.serviceTask ? (
                      <div className="mt-2 rounded-[16px] border border-sage/15 bg-[#EDF5EF] px-3 py-3">
                        <p className="text-[11px] text-navy/45">一句话当前结果</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-navy">
                          {buildResidentFriendlyTaskSnapshot(todo.serviceTask, todo.status).headline}
                        </p>
                      </div>
                    ) : null}
                    <p className="mt-1 text-xs leading-5 text-navy/50">
                      {new Date(todo.createdAt).toLocaleString("zh-CN")}
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push("/service-progress")}
                      className="mt-3 rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white"
                    >
                      查看详情
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="目前没有需要家医团队处理的问题。" description="问 Claw 生成团队提醒后，这里会显示最近进度。" />
            )}
          </SectionCard>
        ) : null}

        {role === "resident" ? (
          <SectionCard title="我的家属联系人">
            {residentBindings.length ? (
              <div className="space-y-3">
                {residentBindings.map((binding) => (
                  <div key={binding.id} className="rounded-[22px] bg-surface-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-navy">{binding.familyName}</p>
                        <p className="mt-1 text-xs text-navy/56">
                          {binding.relationship} / {binding.isPrimary ? "主要联系人" : "家属联系人"}
                        </p>
                      </div>
                      <span className="rounded-full bg-[#EAF1EF] px-3 py-1 text-xs font-semibold text-sage">
                        {binding.status === "active" ? "有效" : binding.status === "pending" ? "待确认" : "已停用"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-navy/62">
                      {binding.note || "可协助查看提醒、任务和服务进度。"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="还没有家属联系人" description="完成绑定后，这里会显示可协助您的家属。" />
            )}
          </SectionCard>
        ) : null}

        {role === "family" ? (
          <SectionCard title="我绑定的老人">
            {familyUserBindings.length ? (
              <div className="space-y-3">
                {familyUserBindings.map((binding) => {
                  const residentSummary = familyResidentSummaries[binding.residentId];
                  const completedCount =
                    authMode === "real"
                      ? residentSummary?.completedTaskCountToday ?? 0
                      : state.completedTaskIds.length;
                  const residentPoints =
                    authMode === "real" ? residentSummary?.totalPoints ?? 0 : pointSummary.current;
                  const residentPendingTodoCount =
                    authMode === "real"
                      ? residentSummary?.pendingTodoCount ?? 0
                      : pendingTodoCount;

                  return (
                    <div key={binding.id} className="rounded-[22px] bg-surface-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-navy">{binding.residentName}</p>
                          <p className="mt-1 text-xs text-navy/56">
                            {binding.relationship} / 今日任务 {completedCount}/{taskTotal}
                          </p>
                        </div>
                        <PointsBadge points={residentPoints} />
                      </div>
                      <p className="mt-3 text-sm leading-6 text-navy/62">
                        待处理提醒 {residentPendingTodoCount} 条。家属端目前仅查看，不替老人完成任务。
                      </p>
                      <button
                        type="button"
                        onClick={() => router.push("/family")}
                        className="mt-4 w-full rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white"
                      >
                        查看老人健康情况
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="还没有绑定老人" description="请联系管理员或家医团队完成绑定。" />
            )}
          </SectionCard>
        ) : null}

        {myTodos.length > 0 ? (
          <SectionCard title="我的待处理提醒">
            <div className="space-y-3">
              {myTodos.slice(0, 3).map((todo) => (
                <div key={todo.id} className="rounded-[22px] border border-line/60 bg-surface-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-sm font-semibold leading-6 text-navy line-clamp-2">
                      {todo.originalQuestion ?? todo.question}
                    </p>
                    <span className="shrink-0 rounded-full border border-amber/20 bg-amber/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber">
                      {statusLabelMap[todo.status] ?? "待处理"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-navy/50">
                    家医团队处理后，状态会在这里更新。
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        {(role === "resident" || role === "family") && (
          <>
            <SectionCard title="我的健康小组">
              <div className="rounded-[22px] bg-surface-card p-4">
                <p className="text-sm font-semibold text-navy">高血压互助小组</p>
                <p className="mt-1 text-xs leading-5 text-navy/58">
                  小组长：{matchedLeader?.leaderName ?? "王阿姨"}。今天 {displayedGroupCheckInCount} 位邻居已打卡。
                </p>
                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => router.push("/group")}
                    className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white"
                  >
                    进群看看
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/match-leader")}
                    className="rounded-full border border-line bg-cream px-4 py-2 text-sm font-semibold text-navy"
                  >
                    找小组长
                  </button>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="我的家医团队">
              <div className="space-y-3">
                {doctorTeam.map((contact) => (
                  <SimpleContactCard
                    key={contact.id}
                    name={contact.name}
                    roleLabel={contact.role}
                    avatarUrl={contact.avatarPath}
                  />
                ))}
              </div>
            </SectionCard>

            <SectionCard title="我的家人联系人">
              <div className="space-y-3">
                {familyMembers.map((contact) => (
                  <SimpleContactCard
                    key={contact.id}
                    name={contact.name}
                    roleLabel={contact.role}
                    avatarUrl={contact.avatarPath}
                  />
                ))}
              </div>
            </SectionCard>
          </>
        )}

        <SectionCard title="设置">
          <div className="space-y-3">
            {authMode === "demo" ? (
              <ActionRow
                icon={<Sparkles className="h-4 w-4 text-sage" />}
                label="体验中心"
                onClick={() => router.push("/demo-center")}
              />
            ) : null}
            <ActionRow
              icon={<Bell className="h-4 w-4 text-sage" />}
              label="通知中心"
              onClick={() => router.push("/notifications")}
            />
            <ActionRow
              icon={<Users className="h-4 w-4 text-sage" />}
              label="重新选择身份"
              onClick={handleReselectIdentity}
            />
            <ActionRow
              icon={<MessageSquareText className="h-4 w-4 text-sage" />}
              label="提交体验反馈"
              onClick={() => router.push("/feedback")}
            />
            {canOpenAdmin ? (
              <ActionRow
                icon={<Settings className="h-4 w-4 text-sage" />}
                label="管理后台"
                onClick={() => router.push("/admin")}
              />
            ) : null}
            {canOpenWorkbench ? (
              <ActionRow
                icon={<ClipboardList className="h-4 w-4 text-sage" />}
                label="家医团队工作台"
                onClick={() => router.push("/doctor")}
              />
            ) : null}
            <ActionRow
              icon={<Users className="h-4 w-4 text-sage" />}
              label="退出当前身份"
              onClick={() => void handleLogout()}
            />
          </div>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}

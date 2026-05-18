"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Bell,
  ClipboardList,
  MessageSquareWarning,
  Users,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { readAskLogs, readDoctorTodos, updateLocalDoctorTodoStatus } from "@/lib/storage";
import { fetchCurrentProfile, getRoleLabel, isWorkbenchRole } from "@/lib/supabase/mvp";
import { AppRole, DemoDoctorTodo, DoctorTodoRow, ProfileRow } from "@/lib/types";
import { useDemoUser } from "@/lib/useDemoUser";

const statusLabelMap: Record<DoctorTodoRow["status"], string> = {
  pending: "待处理",
  processing: "处理中",
  done: "已处理",
  ignored: "已忽略",
};

const statusStyleMap: Record<DoctorTodoRow["status"], string> = {
  pending: "bg-amber/15 text-amber border-amber/20",
  processing: "bg-health-muted text-sage border-sage/20",
  done: "bg-health-success text-success border-success/20",
  ignored: "bg-navy/8 text-navy/50 border-navy/10",
};

const riskStyleMap: Record<string, string> = {
  high: "border-danger/25 bg-risk-soft",
  emergency: "border-danger/40 bg-risk-strong",
  medium: "border-amber/25 bg-surface-card",
  low: "border-line/60 bg-surface-card",
};

const roleContentMap: Record<
  Extract<AppRole, "doctor" | "nurse" | "pharmacist" | "community" | "admin">,
  {
    title: string;
    subtitle: string;
    tasks: string[];
  }
> = {
  doctor: {
    title: "医生工作台",
    subtitle: "专业判断和风险提醒",
    tasks: ["解释体检异常提示", "确认是否需要门诊复诊", "安排本周慢病随访"],
  },
  nurse: {
    title: "护士工作台",
    subtitle: "随访和健康记录",
    tasks: ["提醒居民确认随访时间", "回访连续未打卡居民", "解释小课堂和积分规则"],
  },
  pharmacist: {
    title: "药师工作台",
    subtitle: "配药和用药规则",
    tasks: ["解释社区配药与医院配药区别", "说明长处方与延伸处方规则", "整理药盒对应说明流程"],
  },
  community: {
    title: "社区支持工作台",
    subtitle: "体检通知和操作协助",
    tasks: ["提醒老人查看体检通知", "协助不太会用手机的居民进入页面", "维护高血压互助小组秩序"],
  },
  admin: {
    title: "管理员总览",
    subtitle: "全部数据和管理入口",
    tasks: ["检查 FAQ 命中质量", "更新任务与课程配置", "整理反馈和医生待办趋势"],
  },
};

type AuthMode = "loading" | "supabase" | "demo" | "none";
type SyncMode = "local" | "supabase";

type TodoCardView = {
  id: string;
  title: string;
  summary: string;
  riskLevel: DoctorTodoRow["risk_level"];
  status: DoctorTodoRow["status"];
  source: string;
  createdAt: string;
  recommendedRoleKey?: string;
  recommendedRoleLabel?: string;
  recommendedReason?: string;
  originalQuestion?: string;
  clawAnswer?: string;
  doctorSummary?: string;
  preparedMaterials?: string[];
};

function mapRemoteTodo(todo: DoctorTodoRow): TodoCardView {
  return {
    id: todo.id,
    title: todo.title || "待办事项",
    summary: todo.original_question || todo.description || todo.claw_answer || "暂无更多说明",
    riskLevel: todo.risk_level,
    status: todo.status,
    source: todo.source ?? "ask",
    createdAt: todo.created_at,
  };
}

function mapLocalTodo(todo: DemoDoctorTodo): TodoCardView {
  return {
    id: todo.id,
    title: todo.residentName,
    summary: todo.question,
    riskLevel: todo.riskLevel,
    status: todo.status,
    source: todo.source,
    createdAt: todo.createdAt,
    recommendedRoleKey: todo.recommendedRole,
    recommendedRoleLabel: todo.recommendedRoleLabel ?? todo.recommendedRole,
    recommendedReason: todo.recommendedReason,
    originalQuestion: todo.originalQuestion,
    clawAnswer: todo.clawAnswer,
    doctorSummary: todo.summary,
    preparedMaterials: todo.preparedMaterials,
  };
}

export default function DoctorPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { currentUser: demoUser, isReady: demoUserReady } = useDemoUser();
  const { showToast } = useToast();
  const [todos, setTodos] = useState<TodoCardView[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [syncMode, setSyncMode] = useState<SyncMode>("local");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);

  function activateLocalTodos() {
    setSyncMode("local");
    setTodos(readDoctorTodos().map(mapLocalTodo));
  }

  async function loadRemoteTodos(currentProfile: ProfileRow) {
    const response = await fetch("/api/doctor/todos", { method: "GET", cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      todos?: DoctorTodoRow[];
    };

    if (!response.ok) {
      throw new Error(payload.message ?? "Failed to load doctor todos");
    }

    setProfile(currentProfile);
    setRole(currentProfile.role);
    setAuthMode("supabase");
    setSyncMode("supabase");
    setTodos((payload.todos ?? []).map(mapRemoteTodo));
  }

  useEffect(() => {
    activateLocalTodos();
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (supabase) {
        try {
          const currentProfile = await fetchCurrentProfile(supabase);

          if (!active) {
            return;
          }

          if (currentProfile) {
            setProfile(currentProfile);
            setRole(currentProfile.role);
            setAuthMode("supabase");

            if (isWorkbenchRole(currentProfile.role)) {
              await loadRemoteTodos(currentProfile);
              return;
            }

            return;
          }
        } catch {
          // Fall through to demo/local mode.
        }
      }

      if (!demoUserReady) {
        return;
      }

      if (demoUser) {
        setRole(demoUser.role);
        setAuthMode("demo");
        activateLocalTodos();
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

  async function updateTodoStatus(todoId: string, status: DoctorTodoRow["status"]) {
    if (syncMode === "supabase" && role && isWorkbenchRole(role)) {
      try {
        const response = await fetch("/api/doctor/todos", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ todoId, status }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
          todo?: DoctorTodoRow;
        };

        if (!response.ok || !payload.todo) {
          throw new Error(payload.message ?? "Failed to update todo");
        }

        setTodos((current) =>
          current.map((item) => (item.id === todoId ? mapRemoteTodo(payload.todo as DoctorTodoRow) : item)),
        );
        showToast("待办状态已更新", "success");
        return;
      } catch {
        activateLocalTodos();
        showToast("Supabase 暂时不可用，已回退到本地待办。", "warning");
        return;
      }
    }

    updateLocalDoctorTodoStatus({
      todoId,
      status: status as DemoDoctorTodo["status"],
      actorId: demoUser?.id ?? profile?.id ?? null,
      actorName: demoUser?.name ?? profile?.display_name ?? "",
    });
    const localTodos = readDoctorTodos();
    setTodos(localTodos.map(mapLocalTodo));
    showToast("待办状态已更新", "success");
  }

  const workbenchRole = isWorkbenchRole(role)
    ? (role as "doctor" | "nurse" | "pharmacist" | "community" | "admin")
    : null;
  const roleConfig = workbenchRole ? roleContentMap[workbenchRole] : null;
  const canOpenAdmin = demoUser?.role === "admin" || profile?.role === "admin";

  const isFilteredRole =
    workbenchRole === "nurse" ||
    workbenchRole === "pharmacist" ||
    workbenchRole === "community";

  const { myTodos, otherTodos } = useMemo(() => {
    if (!workbenchRole || !isFilteredRole) {
      return { myTodos: todos, otherTodos: [] as TodoCardView[] };
    }
    const mine: TodoCardView[] = [];
    const rest: TodoCardView[] = [];
    for (const t of todos) {
      if (t.recommendedRoleKey === workbenchRole) {
        mine.push(t);
      } else {
        rest.push(t);
      }
    }
    return { myTodos: mine, otherTodos: rest };
  }, [todos, isFilteredRole, workbenchRole]);

  const pendingCount = myTodos.filter((todo) => todo.status === "pending").length;
  const riskCount = myTodos.filter(
    (todo) => todo.riskLevel === "high" || todo.riskLevel === "emergency",
  ).length;
  const doneCount = myTodos.filter((todo) => todo.status === "done").length;
  const askLogCount = useMemo(() => readAskLogs().length, [todos]);

  const todosByRisk = useMemo(() => {
    const high = myTodos.filter((t) => t.riskLevel === "high" || t.riskLevel === "emergency");
    const medium = myTodos.filter((t) => t.riskLevel === "medium");
    const low = myTodos.filter((t) => t.riskLevel === "low" && t.status !== "done" && t.status !== "ignored");
    const done = myTodos.filter((t) => t.status === "done" || t.status === "ignored");
    return { high, medium, low, done };
  }, [myTodos]);

  if (authMode === "loading") {
    return (
      <PhoneShell showBottomNav>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="团队工作台" subtitle="正在读取当前身份..." />
        </div>
      </PhoneShell>
    );
  }

  if (authMode === "none") {
    return null;
  }

  if (!workbenchRole || !roleConfig) {
    return (
      <PhoneShell showBottomNav>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="团队工作台" subtitle="当前页面仅对医生、护士、药师、社区支持和管理员开放。" />
          <SectionCard>
            <div className="rounded-[24px] bg-surface-card p-5 text-center">
              <p className="text-lg font-semibold text-navy">当前身份暂无工作台权限</p>
              <p className="mt-3 text-sm leading-6 text-navy/64">
                {authMode === "supabase"
                  ? `当前真实账号角色为 ${profile?.role ? getRoleLabel(profile.role) : "用户"}，暂时没有工作台权限。`
                  : "居民和家属可以继续体验首页、问 Claw、任务、群聊和一键找人。"}
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white"
                >
                  返回首页
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/welcome")}
                  className="rounded-full border border-line bg-cream px-5 py-2.5 text-sm font-semibold text-navy"
                >
                  切换身份
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
        <div className="flex items-start justify-between">
          <BackHeader
            sticky
            title={roleConfig.title}
            subtitle={
              authMode === "supabase"
                ? `${profile?.display_name ?? ""} / ${role ? getRoleLabel(role) : ""}`
                : roleConfig.subtitle
            }
          />
          <button
            type="button"
            onClick={() => router.push("/notifications")}
            className="mt-6 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-cream text-navy shadow-soft transition active:scale-95"
            aria-label="通知中心"
          >
            <Bell className="h-4.5 w-4.5" strokeWidth={2.1} />
          </button>
        </div>

        {/* Key Metrics - Dashboard Style */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[22px] bg-surface-card px-4 py-4 border border-line/50">
            <p className="text-[11px] tracking-wide text-navy/50">待处理</p>
            <p className="mt-2 text-2xl font-bold text-navy">{pendingCount}</p>
          </div>
          <div className={`rounded-[22px] px-4 py-4 border ${riskCount > 0 ? "border-danger/25 bg-risk-soft" : "border-line/50 bg-surface-card"}`}>
            <p className="text-[11px] tracking-wide text-danger/70">高风险</p>
            <p className={`mt-2 text-2xl font-bold ${riskCount > 0 ? "text-danger" : "text-navy"}`}>{riskCount}</p>
          </div>
          <div className="rounded-[22px] bg-health-muted px-4 py-4 border border-sage/20">
            <p className="text-[11px] tracking-wide text-sage">FAQ 已分流</p>
            <p className="mt-2 text-2xl font-bold text-navy">{askLogCount}</p>
          </div>
          <div className="rounded-[22px] bg-health-success px-4 py-4 border border-success/15">
            <p className="text-[11px] tracking-wide text-success">已处理</p>
            <p className="mt-2 text-2xl font-bold text-success">{doneCount}</p>
          </div>
        </div>

        {/* Todos by risk group */}
        <SectionCard title={isFilteredRole ? "建议我处理的待办" : "Claw 转入待办"}>
          {todos.length ? (
            <div className="space-y-3">
              {todosByRisk.high.length > 0 && (
                <div className="mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-danger" />
                  <span className="text-xs font-semibold text-danger">高风险</span>
                </div>
              )}
              {todosByRisk.high.map((todo) => (
                <TodoCard key={todo.id} todo={todo} onStatusChange={updateTodoStatus} />
              ))}

              {todosByRisk.medium.length > 0 && (
                <div className="mb-2 mt-4 flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-amber" />
                  <span className="text-xs font-semibold text-amber">需要关注</span>
                </div>
              )}
              {todosByRisk.medium.map((todo) => (
                <TodoCard key={todo.id} todo={todo} onStatusChange={updateTodoStatus} />
              ))}

              {todosByRisk.low.length > 0 && (
                <div className="mb-2 mt-4 flex items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5 text-sage" />
                  <span className="text-xs font-semibold text-sage">流程协助</span>
                </div>
              )}
              {todosByRisk.low.map((todo) => (
                <TodoCard key={todo.id} todo={todo} onStatusChange={updateTodoStatus} />
              ))}

              {todosByRisk.done.length > 0 && (
                <div className="mb-2 mt-4 flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-navy/40" />
                  <span className="text-xs font-semibold text-navy/40">已处理</span>
                </div>
              )}
              {todosByRisk.done.map((todo) => (
                <TodoCard key={todo.id} todo={todo} onStatusChange={updateTodoStatus} />
              ))}
            </div>
          ) : (
            <div className="rounded-[22px] bg-surface-card px-4 py-6 text-center">
              <Activity className="mx-auto h-8 w-8 text-sage/60" />
              <p className="mt-3 text-sm text-navy/60">
                当前没有新的待办。问 Claw 出现高风险问题后，这里会自动出现。
              </p>
            </div>
          )}
        </SectionCard>

        {isFilteredRole && otherTodos.length > 0 ? (
          <SectionCard title="其他角色待办">
            <p className="mb-3 text-xs text-navy/50">
              以下待办建议由其他角色处理，仅供参考。
            </p>
            <div className="space-y-3">
              {otherTodos.map((todo) => (
                <TodoCard key={todo.id} todo={todo} onStatusChange={updateTodoStatus} />
              ))}
            </div>
          </SectionCard>
        ) : null}

        {/* Dynamic alerts from real todos */}
        <SectionCard title="风险与提醒">
          <div className="space-y-2.5">
            {todosByRisk.high.length > 0 ? (
              todosByRisk.high.slice(0, 3).map((todo) => (
                <div
                  key={`alert-${todo.id}`}
                  className="flex items-center gap-3 rounded-[20px] border border-danger/15 bg-risk-soft px-4 py-3 text-sm text-danger"
                >
                  <MessageSquareWarning className="h-4 w-4 shrink-0" />
                  {todo.title}：{todo.summary.length > 30 ? `${todo.summary.slice(0, 30)}…` : todo.summary}
                </div>
              ))
            ) : (
              <div className="rounded-[20px] border border-sage/20 bg-health-soft px-4 py-3 text-sm text-sage">
                当前没有高风险提醒，继续保持关注。
              </div>
            )}
          </div>
        </SectionCard>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex h-12 items-center justify-center gap-2 rounded-[20px] bg-navy text-sm font-semibold text-white"
          >
            <Activity className="h-4 w-4" />
            返回首页
          </button>
          <button
            type="button"
            onClick={() => router.push("/welcome")}
            className="flex h-12 items-center justify-center gap-2 rounded-[20px] border border-line bg-cream text-sm font-semibold text-navy"
          >
            <Users className="h-4 w-4" />
            切换身份
          </button>
          {canOpenAdmin ? (
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-[20px] border border-line bg-surface-card text-sm font-semibold text-navy"
            >
              <ClipboardList className="h-4 w-4" />
              进入管理后台
            </button>
          ) : null}
        </div>
      </div>
    </PhoneShell>
  );
}

function TodoCard({
  todo,
  onStatusChange,
}: {
  todo: TodoCardView;
  onStatusChange: (id: string, status: DoctorTodoRow["status"]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const riskStyle = riskStyleMap[todo.riskLevel] || riskStyleMap.low;
  const hasSummaryDetails = !!(todo.originalQuestion || todo.clawAnswer || todo.doctorSummary || todo.preparedMaterials?.length);

  return (
    <div className={`rounded-[22px] border p-4 ${riskStyle}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-navy">{todo.title}</p>
          <p className="mt-1 text-xs text-navy/50">
            来源：{todo.source} · {new Date(todo.createdAt).toLocaleDateString()}
          </p>
          {todo.doctorSummary ? (
            <p className="mt-2.5 text-sm leading-6 text-navy/72">{todo.doctorSummary}</p>
          ) : (
            <p className="mt-2.5 text-sm leading-6 text-navy/72 line-clamp-3">{todo.summary}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusStyleMap[todo.status]}`}>
          {statusLabelMap[todo.status]}
        </span>
      </div>
      {todo.recommendedRoleLabel ? (
        <div className="mt-3 rounded-[14px] border border-sage/20 bg-health-soft/60 px-3 py-2">
          <p className="text-xs font-semibold text-sage">
            建议处理：{todo.recommendedRoleLabel}
          </p>
          {todo.recommendedReason ? (
            <p className="mt-0.5 text-xs text-navy/55">{todo.recommendedReason}</p>
          ) : null}
        </div>
      ) : null}
      {hasSummaryDetails ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2.5 text-xs font-semibold text-sage active:scale-95"
        >
          {expanded ? "收起详情" : "展开 Claw 整理详情"}
        </button>
      ) : null}
      {expanded && hasSummaryDetails ? (
        <div className="mt-3 space-y-2.5 rounded-[16px] border border-sage/15 bg-white/60 p-3 text-sm leading-6 text-navy/75">
          {todo.originalQuestion ? (
            <div>
              <p className="text-[11px] font-semibold text-navy/45">居民原始问题</p>
              <p className="mt-0.5">{todo.originalQuestion}</p>
            </div>
          ) : null}
          {todo.clawAnswer ? (
            <div>
              <p className="text-[11px] font-semibold text-navy/45">Claw 回答</p>
              <p className="mt-0.5">{todo.clawAnswer}</p>
            </div>
          ) : null}
          {todo.preparedMaterials && todo.preparedMaterials.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold text-navy/45">建议准备的材料</p>
              <ul className="mt-0.5 space-y-0.5">
                {todo.preparedMaterials.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(statusLabelMap) as DoctorTodoRow["status"][]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => void onStatusChange(todo.id, status)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              todo.status === status
                ? "bg-navy text-white"
                : "border border-line/70 bg-cream text-navy active:scale-95"
            }`}
          >
            {statusLabelMap[status]}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  GraduationCap,
  MessageSquareWarning,
  Users,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { readDoctorTodos, writeDoctorTodos } from "@/lib/storage";
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
  processing: "bg-[#E8F0EE] text-sage border-sage/20",
  done: "bg-[#DDEFE4] text-[#2F6C56] border-[#2F6C56]/20",
  ignored: "bg-navy/8 text-navy/50 border-navy/10",
};

const riskStyleMap: Record<string, string> = {
  high: "border-danger/25 bg-[#FBF0ED]",
  emergency: "border-danger/40 bg-[#F8E4DF]",
  medium: "border-amber/25 bg-[#FFF8ED]",
  low: "border-line/60 bg-[#FFF8ED]",
};

const roleContentMap: Record<
  Extract<AppRole, "doctor" | "nurse" | "pharmacist" | "community" | "admin">,
  {
    title: string;
    subtitle: string;
    overview: { label: string; value: string; icon: typeof Users }[];
    tasks: string[];
    alerts: string[];
  }
> = {
  doctor: {
    title: "医生工作台",
    subtitle: "专业判断和风险提醒",
    overview: [
      { label: "居民提问", value: "12 条", icon: Users },
      { label: "风险提醒", value: "2 条", icon: AlertTriangle },
      { label: "待处理工单", value: "5 条", icon: ClipboardList },
      { label: "课程推荐", value: "3 条", icon: GraduationCap },
    ],
    tasks: ["解释体检异常提示", "确认是否需要门诊复诊", "安排本周慢病随访"],
    alerts: ["有居民咨询停药相关问题", "有居民咨询报告异常是否严重"],
  },
  nurse: {
    title: "护士工作台",
    subtitle: "随访和健康记录",
    overview: [
      { label: "待随访确认", value: "6 条", icon: Users },
      { label: "提醒协助", value: "4 条", icon: AlertTriangle },
      { label: "打卡异常", value: "3 条", icon: ClipboardList },
      { label: "健康教育", value: "2 条", icon: GraduationCap },
    ],
    tasks: ["提醒居民确认随访时间", "回访连续未打卡居民", "解释小课堂和积分规则"],
    alerts: ["有居民连续两天未记录血压", "���居民错过随访确认电话"],
  },
  pharmacist: {
    title: "药师工作台",
    subtitle: "配药和用药规则",
    overview: [
      { label: "配药咨询", value: "5 条", icon: Users },
      { label: "用药说明", value: "4 条", icon: AlertTriangle },
      { label: "规则解释", value: "3 条", icon: ClipboardList },
      { label: "药盒识别", value: "2 条", icon: GraduationCap },
    ],
    tasks: ["解释社区配药与医院配药区别", "说明长处方与延伸处方规则", "整理药盒对应说明流程"],
    alerts: ["有居民问药快吃完了怎么办", "有居民问社区没有这个药怎么办"],
  },
  community: {
    title: "社区支持工作台",
    subtitle: "体检通知和操作协助",
    overview: [
      { label: "通知任务", value: "8 条", icon: Users },
      { label: "操作协助", value: "4 条", icon: AlertTriangle },
      { label: "体检动员", value: "3 条", icon: ClipboardList },
      { label: "群组维护", value: "2 条", icon: GraduationCap },
    ],
    tasks: ["提醒老人查看体检通知", "协助不太会用手机的居民进入页面", "维护高血压互助小组秩序"],
    alerts: ["有居民不会查看公众号排班表", "��居民需要协助联系家庭医生"],
  },
  admin: {
    title: "管理员总览",
    subtitle: "全部数据和管理入口",
    overview: [
      { label: "FAQ 配置", value: "42 条", icon: Users },
      { label: "课程内容", value: "12 条", icon: GraduationCap },
      { label: "任务模板", value: "10 条", icon: ClipboardList },
      { label: "全部待办", value: "9 条", icon: AlertTriangle },
    ],
    tasks: ["检查 FAQ 命中质量", "更新任务与课程配置", "整理反馈和医生待办趋势"],
    alerts: ["有高风险问答待人工复核", "有新反馈建议需要整理"],
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
  recommendedRole?: string;
  recommendedReason?: string;
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
    recommendedRole: todo.recommendedRole,
    recommendedReason: todo.recommendedReason,
  };
}

export default function DoctorPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { currentUser: demoUser } = useDemoUser();
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

      if (demoUser) {
        setRole(demoUser.role);
        setAuthMode("demo");
        activateLocalTodos();
        return;
      }

      setAuthMode("none");
      router.replace("/login");
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [demoUser, router, supabase]);

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

    const localTodos = readDoctorTodos().map((todo) =>
      todo.id === todoId ? { ...todo, status: status as DemoDoctorTodo["status"] } : todo,
    );
    writeDoctorTodos(localTodos);
    setTodos(localTodos.map(mapLocalTodo));
    showToast("待办状态已更新", "success");
  }

  if (authMode === "loading") {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="团队工作台" subtitle="正在读取当前身份..." />
        </div>
      </PhoneShell>
    );
  }

  if (authMode === "none") {
    return null;
  }

  if (!isWorkbenchRole(role)) {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="团队工作台" subtitle="当前页面仅对医生、护士、药师、社区支持和管理员开放。" />
          <SectionCard>
            <div className="rounded-[24px] bg-[#FFF8ED] p-5 text-center">
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
                  onClick={() => router.push("/login")}
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

  const workbenchRole = role as "doctor" | "nurse" | "pharmacist" | "community" | "admin";
  const roleConfig = roleContentMap[workbenchRole];
  const pendingCount = todos.filter((todo) => todo.status === "pending").length;
  const riskCount = todos.filter(
    (todo) => todo.riskLevel === "high" || todo.riskLevel === "emergency",
  ).length;
  const doneCount = todos.filter((todo) => todo.status === "done").length;
  const canOpenAdmin = demoUser?.role === "admin" || profile?.role === "admin";

  const todosByRisk = useMemo(() => {
    const high = todos.filter((t) => t.riskLevel === "high" || t.riskLevel === "emergency");
    const medium = todos.filter((t) => t.riskLevel === "medium");
    const low = todos.filter((t) => t.riskLevel === "low" && t.status !== "done" && t.status !== "ignored");
    const done = todos.filter((t) => t.status === "done" || t.status === "ignored");
    return { high, medium, low, done };
  }, [todos]);

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader
          sticky
          title={roleConfig.title}
          subtitle={
            authMode === "supabase"
              ? `${profile?.display_name ?? ""} / ${role ? getRoleLabel(role) : ""}`
              : roleConfig.subtitle
          }
        />

        {/* Key Metrics - Dashboard Style */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[22px] bg-[#FFF8ED] px-4 py-4 border border-line/50">
            <p className="text-[11px] tracking-wide text-navy/50">待处理</p>
            <p className="mt-2 text-2xl font-bold text-navy">{pendingCount}</p>
          </div>
          <div className={`rounded-[22px] px-4 py-4 border ${riskCount > 0 ? "border-danger/25 bg-[#FBF0ED]" : "border-line/50 bg-[#FFF8ED]"}`}>
            <p className="text-[11px] tracking-wide text-danger/70">高风险</p>
            <p className={`mt-2 text-2xl font-bold ${riskCount > 0 ? "text-danger" : "text-navy"}`}>{riskCount}</p>
          </div>
          <div className="rounded-[22px] bg-[#E8F0EE] px-4 py-4 border border-sage/20">
            <p className="text-[11px] tracking-wide text-sage">FAQ 已分流</p>
            <p className="mt-2 text-2xl font-bold text-navy">
              {roleConfig.overview[0]?.value?.replace(" 条", "") ?? "0"}
            </p>
          </div>
          <div className="rounded-[22px] bg-[#DDEFE4] px-4 py-4 border border-[#2F6C56]/15">
            <p className="text-[11px] tracking-wide text-[#2F6C56]">已处理</p>
            <p className="mt-2 text-2xl font-bold text-[#2F6C56]">{doneCount}</p>
          </div>
        </div>

        {/* Todos by risk group */}
        <SectionCard title="Claw 转入待办">
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
            <div className="rounded-[22px] bg-[#FFF8ED] px-4 py-6 text-center">
              <Activity className="mx-auto h-8 w-8 text-sage/60" />
              <p className="mt-3 text-sm text-navy/60">
                当前没有新的待办。问 Claw 出现高风险问题后，这里会自动出现。
              </p>
            </div>
          )}
        </SectionCard>

        {/* Role-specific alerts */}
        <SectionCard title="风险与提醒">
          <div className="space-y-2.5">
            {roleConfig.alerts.map((line) => (
              <div
                key={line}
                className="flex items-center gap-3 rounded-[20px] border border-danger/15 bg-[#FBF0ED] px-4 py-3 text-sm text-danger"
              >
                <MessageSquareWarning className="h-4 w-4 shrink-0" />
                {line}
              </div>
            ))}
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
            onClick={() => router.push("/login")}
            className="flex h-12 items-center justify-center gap-2 rounded-[20px] border border-line bg-cream text-sm font-semibold text-navy"
          >
            <Users className="h-4 w-4" />
            切换身份
          </button>
          {canOpenAdmin ? (
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-[20px] border border-line bg-[#FFF8ED] text-sm font-semibold text-navy"
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
  const riskStyle = riskStyleMap[todo.riskLevel] || riskStyleMap.low;

  return (
    <div className={`rounded-[22px] border p-4 ${riskStyle}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-navy">{todo.title}</p>
          <p className="mt-1 text-xs text-navy/50">
            来源：{todo.source} · {new Date(todo.createdAt).toLocaleDateString()}
          </p>
          <p className="mt-2.5 text-sm leading-6 text-navy/72 line-clamp-3">{todo.summary}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusStyleMap[todo.status]}`}>
          {statusLabelMap[todo.status]}
        </span>
      </div>
      {todo.recommendedRole ? (
        <div className="mt-3 rounded-[14px] border border-sage/20 bg-[#EEF5F3]/60 px-3 py-2">
          <p className="text-xs font-semibold text-sage">
            建议处理：{todo.recommendedRole}
          </p>
          {todo.recommendedReason ? (
            <p className="mt-0.5 text-xs text-navy/55">{todo.recommendedReason}</p>
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

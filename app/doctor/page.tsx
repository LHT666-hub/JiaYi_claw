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
import {
  getCurrentServiceOwnerRole,
  parseDescriptionWithServiceTask,
} from "@/lib/agentTaskPayload";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { readAskLogs, readDoctorTodos, updateLocalDoctorTodoStatus } from "@/lib/storage";
import { fetchCurrentProfile, getRoleLabel, isWorkbenchRole } from "@/lib/supabase/mvp";
import {
  AppRole,
  DemoDoctorTodo,
  DoctorTodoRow,
  PersistedServiceTask,
  ProfileRow,
} from "@/lib/types";
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
  serviceTask?: PersistedServiceTask | null;
};

type TodoAction = {
  label: string;
  status: DoctorTodoRow["status"];
  note?: string;
  tone?: "primary" | "secondary" | "danger";
  serviceFactUpdates?: Array<{ label: string; value: string; tone?: "neutral" | "positive" | "warning" }>;
};

function getServiceRequestRows(todo: TodoCardView) {
  const request = todo.serviceTask?.serviceRequest;

  if (!request) {
    return [];
  }

  if (request.kind === "registration") {
    return [
      request.symptom ? { label: "症状/问题", value: request.symptom } : null,
      request.department ? { label: "目标门诊", value: request.department } : null,
      request.preferredDoctor ? { label: "优先医生", value: request.preferredDoctor } : null,
      request.preferredDate || request.preferredTime
        ? { label: "期望时段", value: `${request.preferredDate ?? ""}${request.preferredTime ?? ""}`.trim() }
        : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;
  }

  if (request.kind === "family_doctor") {
    return [
      request.serviceMode
        ? {
            label: "服务方式",
            value:
              request.serviceMode === "clinic"
                ? "线下面诊"
                : request.serviceMode === "phone"
                  ? "电话回访"
                  : request.serviceMode === "home_visit"
                    ? "上门服务"
                    : "面诊、电话或上门均可",
          }
        : null,
      request.preferredDate || request.preferredTime
        ? { label: "期望时段", value: `${request.preferredDate ?? ""}${request.preferredTime ?? ""}`.trim() }
        : null,
      request.note ? { label: "补充说明", value: request.note } : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;
  }

  if (request.kind === "dispense_status") {
    return [
      request.medicineName ? { label: "药品名称", value: request.medicineName } : null,
      request.progressFocus
        ? {
            label: "关注环节",
            value:
              request.progressFocus === "review"
                ? "医生/药师审核"
                : request.progressFocus === "dispense"
                  ? "药房配药"
                  : request.progressFocus === "delivery"
                    ? "配送或自取"
                    : "整体进度",
          }
        : null,
      request.deliveryMethod
        ? {
            label: "交付方式",
            value:
              request.deliveryMethod === "pickup"
                ? "到店自取"
                : request.deliveryMethod === "mail"
                  ? "邮寄到家"
                  : "自取或邮寄都可以",
          }
        : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;
  }

  if (request.kind === "followup") {
    return [
      request.followupType
        ? {
            label: "提醒类型",
            value:
              request.followupType === "phone_followup"
                ? "电话随访"
                : request.followupType === "checkup"
                  ? "复查提醒"
                  : request.followupType === "medication_reminder"
                    ? "用药提醒"
                    : "复诊提醒",
          }
        : null,
      request.preferredDate ? { label: "期望时间", value: request.preferredDate } : null,
      request.note ? { label: "补充说明", value: request.note } : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;
  }

  return [
    request.medicineName ? { label: "药品名称", value: request.medicineName } : null,
    request.disease ? { label: "慢病类型", value: request.disease } : null,
    request.stockLeft ? { label: "剩余药量", value: request.stockLeft } : null,
    request.deliveryMethod
      ? {
          label: "交付方式",
          value:
            request.deliveryMethod === "pickup"
              ? "到店自取"
              : request.deliveryMethod === "mail"
                ? "邮寄到家"
                : "自取或邮寄都可以",
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;
}

function getTodoActionOptions(
  todo: TodoCardView,
  workbenchRole: Extract<AppRole, "doctor" | "nurse" | "pharmacist" | "community" | "admin"> | null,
): TodoAction[] {
  const intent = todo.serviceTask?.task.intent;
  const currentStep = todo.serviceTask?.task.steps.find((step) => step.status === "current");

  if (!intent || !currentStep || !workbenchRole || todo.status === "ignored") {
    return [];
  }

  if (intent === "refill_request") {
    if (workbenchRole === "doctor" && currentStep.ownerRole === "doctor") {
      return [
        {
          label: "审核通过并转药师",
          status: "done",
          note: "医生已确认可续方，转药师继续审方。",
          tone: "primary",
          serviceFactUpdates: [{ label: "是否需线下复诊", value: "本次评估可先续方，无需额外线下复诊", tone: "positive" }],
        },
        {
          label: "需线下复诊",
          status: "ignored",
          note: "医生判断需要线下复诊后再决定是否续方。",
          tone: "danger",
          serviceFactUpdates: [{ label: "是否需线下复诊", value: "医生判断需线下复诊后再决定是否续方", tone: "warning" }],
        },
      ];
    }

    if (workbenchRole === "pharmacist" && currentStep.title.includes("审方")) {
      return [
        {
          label: "审方通过",
          status: "done",
          note: "药师已完成审方，转药房配药。",
          tone: "primary",
          serviceFactUpdates: [{ label: "可续方目录", value: "药师已确认本次药品符合续方流转条件", tone: "positive" }],
        },
        { label: "补充用药信息", status: "processing", note: "已联系居民补充用药信息。", tone: "secondary" },
      ];
    }

    if (workbenchRole === "pharmacist" && currentStep.title.includes("配药")) {
      return [
        {
          label: "已配好",
          status: "done",
          note: "药房已完成配药，待确认交付方式。",
          tone: "primary",
          serviceFactUpdates: [
            { label: "药房库存", value: "库存已锁定并完成配药", tone: "positive" },
            { label: "服务状态", value: "药品已配好，正在确认最终交付方式", tone: "positive" },
          ],
        },
      ];
    }

    if (workbenchRole === "pharmacist" && (currentStep.title.includes("交付") || currentStep.title.includes("自取") || currentStep.title.includes("邮寄"))) {
      return [
        {
          label: "通知自取",
          status: "done",
          note: "已通知居民到店自取，服务流程完成。",
          tone: "primary",
          serviceFactUpdates: [{ label: "交付方式", value: "已通知居民到店自取", tone: "positive" }],
        },
        {
          label: "安排邮寄",
          status: "done",
          note: "已安排邮寄并告知居民留意签收，服务流程完成。",
          tone: "secondary",
          serviceFactUpdates: [{ label: "交付方式", value: "已安排邮寄到家", tone: "positive" }],
        },
      ];
    }
  }

  if (intent === "clinic_registration" && workbenchRole === "community" && currentStep.ownerRole === "community") {
    return [
      {
        label: "已锁定号源",
        status: "processing",
        note: "已锁定候选号源，等待最终确认。",
        tone: "secondary",
        serviceFactUpdates: [{ label: "号源确认", value: "已锁定候选号源，等待居民最终确认", tone: "positive" }],
      },
      {
        label: "已预约完成",
        status: "done",
        note: "门诊预约已完成，已回写预约结果。",
        tone: "primary",
        serviceFactUpdates: [
          { label: "号源确认", value: "已完成预约并回写就诊结果", tone: "positive" },
          { label: "下一动作", value: "请按预约时间携带证件到院就诊", tone: "positive" },
        ],
      },
    ];
  }

  if (intent === "family_doctor_booking" && workbenchRole === "doctor" && currentStep.ownerRole === "doctor") {
    return [
      {
        label: "已确认时段",
        status: "done",
        note: "家庭医生团队已确认服务时段。",
        tone: "primary",
        serviceFactUpdates: [
          { label: "联系窗口", value: "家医团队已确认本次服务时段并通知居民", tone: "positive" },
          { label: "下一动作", value: "请留意家医团队来电或按时参加面诊", tone: "positive" },
        ],
      },
      {
        label: "改约其他时段",
        status: "processing",
        note: "正在协调新的服务时段。",
        tone: "secondary",
        serviceFactUpdates: [{ label: "联系窗口", value: "居民当前时段不便，家医团队正在协调新时间", tone: "warning" }],
      },
    ];
  }

  if (intent === "followup_reminder" && workbenchRole === "nurse" && currentStep.ownerRole === "nurse") {
    return [
      {
        label: "已安排随访",
        status: "processing",
        note: "已安排随访时间，继续跟进。",
        tone: "secondary",
        serviceFactUpdates: [{ label: "下一动作", value: "已锁定随访时间，等待按时回访", tone: "positive" }],
      },
      {
        label: "已完成随访",
        status: "done",
        note: "随访已完成并同步给居民。",
        tone: "primary",
        serviceFactUpdates: [{ label: "下一动作", value: "已完成随访并回写给居民与家属", tone: "positive" }],
      },
    ];
  }

  if (intent === "dispense_status_query" && workbenchRole === "pharmacist" && currentStep.ownerRole === "pharmacist") {
    return [
      {
        label: "同步最新进度",
        status: "processing",
        note: "已同步当前配药进度给居民。",
        tone: "secondary",
        serviceFactUpdates: [{ label: "服务状态", value: "药师已同步当前配药进度，居民可在进度页查看", tone: "positive" }],
      },
      {
        label: "配药已完成",
        status: "done",
        note: "配药流程已完成，居民可查看结果。",
        tone: "primary",
        serviceFactUpdates: [
          { label: "服务状态", value: "配药已完成，可按通知领取或等待配送", tone: "positive" },
          { label: "下一动作", value: "请根据通知选择取药或留意配送进度", tone: "positive" },
        ],
      },
    ];
  }

  return [];
}

function mapRemoteTodo(todo: DoctorTodoRow): TodoCardView {
  const descriptionPayload = parseDescriptionWithServiceTask(todo.description);
  const serviceTask = descriptionPayload.serviceTask;

  return {
    id: todo.id,
    title: serviceTask?.task.title || todo.title || "待办事项",
    summary:
      todo.original_question ||
      descriptionPayload.plainDescription ||
      serviceTask?.task.summary ||
      todo.claw_answer ||
      "暂无更多说明",
    riskLevel: todo.risk_level,
    status: todo.status,
    source: todo.source ?? "ask",
    createdAt: todo.created_at,
    recommendedRoleKey: getCurrentServiceOwnerRole(serviceTask) ?? undefined,
    recommendedRoleLabel: serviceTask?.task.recommendedTeam,
    recommendedReason: serviceTask?.needsHumanReview
      ? `该服务需要 ${serviceTask.task.recommendedTeam} 继续处理。`
      : undefined,
    originalQuestion: todo.original_question ?? undefined,
    clawAnswer: todo.claw_answer ?? undefined,
    doctorSummary: descriptionPayload.plainDescription ?? serviceTask?.task.summary,
    preparedMaterials: serviceTask?.task.preparedMaterials,
    serviceTask,
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
    recommendedRoleKey: getCurrentServiceOwnerRole(todo.serviceTask) ?? todo.recommendedRole,
    recommendedRoleLabel: todo.recommendedRoleLabel ?? todo.recommendedRole,
    recommendedReason: todo.recommendedReason,
    originalQuestion: todo.originalQuestion,
    clawAnswer: todo.clawAnswer,
    doctorSummary: todo.summary,
    preparedMaterials: todo.preparedMaterials,
    serviceTask: todo.serviceTask ?? null,
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
  const [remoteError, setRemoteError] = useState<string | null>(null);

  function activateLocalTodos() {
    setSyncMode("local");
    setRemoteError(null);
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
    setRemoteError(null);
    setTodos((payload.todos ?? []).map(mapRemoteTodo));
  }

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
              try {
                await loadRemoteTodos(currentProfile);
              } catch {
                if (!active) {
                  return;
                }
                setSyncMode("supabase");
                setRemoteError("当前账号已登录，但团队待办暂时还没同步成功。请稍后刷新，或先查看通知与服务进度。");
                setTodos([]);
              }
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

  async function updateTodoStatus(
    todoId: string,
    status: DoctorTodoRow["status"],
    note?: string,
    serviceFactUpdates?: TodoAction["serviceFactUpdates"],
  ) {
    if (syncMode === "supabase" && role && isWorkbenchRole(role)) {
      try {
        const response = await fetch("/api/doctor/todos", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ todoId, status, note, serviceFactUpdates }),
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
        setRemoteError("待办状态暂时没有同步成功，请稍后重试。");
        showToast("待办状态暂时没有同步成功，请稍后重试。", "warning");
        return;
      }
    }

    updateLocalDoctorTodoStatus({
      todoId,
      status: status as DemoDoctorTodo["status"],
      actorId: demoUser?.id ?? profile?.id ?? null,
      actorName: demoUser?.name ?? profile?.display_name ?? "",
      note,
      serviceFactUpdates,
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
  const askLogCount = syncMode === "supabase" ? todos.length : readAskLogs().length;

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
            <p className="text-[11px] tracking-wide text-sage">
              {syncMode === "supabase" ? "Claw 已转入" : "FAQ 已分流"}
            </p>
            <p className="mt-2 text-2xl font-bold text-navy">{askLogCount}</p>
          </div>
          <div className="rounded-[22px] bg-health-success px-4 py-4 border border-success/15">
            <p className="text-[11px] tracking-wide text-success">已处理</p>
            <p className="mt-2 text-2xl font-bold text-success">{doneCount}</p>
          </div>
        </div>

        {authMode === "supabase" && remoteError ? (
          <SectionCard>
            <div className="rounded-[22px] border border-amber/25 bg-[#FFF6EA] px-4 py-4">
              <p className="text-sm font-semibold text-navy">数据同步稍有延迟</p>
              <p className="mt-1 text-sm leading-6 text-navy/66">{remoteError}</p>
            </div>
          </SectionCard>
        ) : null}

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
                <TodoCard key={todo.id} todo={todo} workbenchRole={workbenchRole} onStatusChange={updateTodoStatus} />
              ))}

              {todosByRisk.medium.length > 0 && (
                <div className="mb-2 mt-4 flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-amber" />
                  <span className="text-xs font-semibold text-amber">需要关注</span>
                </div>
              )}
              {todosByRisk.medium.map((todo) => (
                <TodoCard key={todo.id} todo={todo} workbenchRole={workbenchRole} onStatusChange={updateTodoStatus} />
              ))}

              {todosByRisk.low.length > 0 && (
                <div className="mb-2 mt-4 flex items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5 text-sage" />
                  <span className="text-xs font-semibold text-sage">流程协助</span>
                </div>
              )}
              {todosByRisk.low.map((todo) => (
                <TodoCard key={todo.id} todo={todo} workbenchRole={workbenchRole} onStatusChange={updateTodoStatus} />
              ))}

              {todosByRisk.done.length > 0 && (
                <div className="mb-2 mt-4 flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-navy/40" />
                  <span className="text-xs font-semibold text-navy/40">已处理</span>
                </div>
              )}
              {todosByRisk.done.map((todo) => (
                <TodoCard key={todo.id} todo={todo} workbenchRole={workbenchRole} onStatusChange={updateTodoStatus} />
              ))}
            </div>
          ) : (
            <div className="rounded-[22px] bg-surface-card px-4 py-6 text-center">
              <Activity className="mx-auto h-8 w-8 text-sage/60" />
              <p className="mt-3 text-sm text-navy/60">
                {authMode === "supabase" && remoteError
                  ? "当前先不显示本地占位待办，等远程数据同步成功后会在这里出现。"
                  : "当前没有新的待办。问 Claw 出现高风险问题后，这里会自动出现。"}
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
                <TodoCard key={todo.id} todo={todo} workbenchRole={workbenchRole} onStatusChange={updateTodoStatus} />
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
  workbenchRole,
  onStatusChange,
}: {
  todo: TodoCardView;
  workbenchRole: Extract<AppRole, "doctor" | "nurse" | "pharmacist" | "community" | "admin"> | null;
  onStatusChange: (
    id: string,
    status: DoctorTodoRow["status"],
    note?: string,
    serviceFactUpdates?: TodoAction["serviceFactUpdates"],
  ) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const riskStyle = riskStyleMap[todo.riskLevel] || riskStyleMap.low;
  const hasSummaryDetails = !!(todo.originalQuestion || todo.clawAnswer || todo.doctorSummary || todo.preparedMaterials?.length);
  const actionOptions = getTodoActionOptions(todo, workbenchRole);
  const serviceRequestRows = getServiceRequestRows(todo);

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
      {todo.serviceTask ? (
        <div className="mt-3 rounded-[16px] border border-sage/15 bg-white/60 p-3">
          <p className="text-[11px] font-semibold text-sage">{todo.serviceTask.label}</p>
          <p className="mt-1 text-sm font-semibold text-navy">{todo.serviceTask.task.title}</p>
          {serviceRequestRows.length ? (
            <div className="mt-3 grid grid-cols-1 gap-2">
              {serviceRequestRows.map((row) => (
                <div key={`${todo.id}-${row.label}`} className="rounded-[14px] border border-line/60 bg-cream px-3 py-2">
                  <p className="text-[11px] text-navy/45">{row.label}</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-navy">{row.value}</p>
                </div>
              ))}
            </div>
          ) : null}
          {todo.serviceTask.task.serviceFacts?.length ? (
            <div className="mt-3 grid grid-cols-1 gap-2">
              {todo.serviceTask.task.serviceFacts.map((fact) => (
                <div
                  key={`${todo.id}-${fact.label}`}
                  className={`rounded-[14px] border px-3 py-2 ${
                    fact.tone === "warning"
                      ? "border-amber/20 bg-[#FFF8ED]"
                      : "border-line/60 bg-white/80"
                  }`}
                >
                  <p className="text-[11px] text-navy/45">{fact.label}</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-navy">{fact.value}</p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-2 space-y-1.5">
            {todo.serviceTask.task.steps.map((step) => (
              <div key={`${todo.id}-${step.title}`} className="flex items-center gap-2 text-xs text-navy/68">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    step.status === "done"
                      ? "bg-success"
                      : step.status === "current"
                        ? "bg-sage"
                        : "bg-navy/20"
                  }`}
                />
                <span className="flex-1">{step.title}</span>
                <span className="text-navy/45">{step.owner}</span>
              </div>
            ))}
          </div>
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
      {actionOptions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {actionOptions.map((action) => (
            <button
              key={`${todo.id}-${action.label}`}
              type="button"
              onClick={() => void onStatusChange(todo.id, action.status, action.note, action.serviceFactUpdates)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
                action.tone === "danger"
                  ? "border border-danger/25 bg-risk-soft text-danger"
                  : action.tone === "secondary"
                    ? "border border-sage/20 bg-health-soft text-sage"
                    : "bg-navy text-white"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-line/50 pt-3">
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

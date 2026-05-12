import { generateClawSummary, getRecommendedRole } from "@/lib/clawSummary";
import {
  DemoDoctorTodo,
  DoctorTodoRow,
  ResidentTodoProgressItem,
  RiskLevel,
  TodoStatusEvent,
} from "@/lib/types";

export const serviceStatusLabelMap: Record<string, string> = {
  pending: "已提交给家医团队",
  processing: "正在处理",
  done: "已处理",
  ignored: "已关闭",
};

function buildSummaryFields(params: {
  question: string;
  clawAnswer?: string | null;
  riskLevel: RiskLevel;
  recommendedRole?: string;
  recommendedRoleLabel?: string;
  recommendedReason?: string;
  summary?: string | null;
  preparedMaterials?: string[] | null;
}) {
  const generated = generateClawSummary(params.question, {
    answer: params.clawAnswer ?? "Claw 已整理这条问题，并建议家医团队继续跟进。",
    nextStep: "",
    riskLevel: params.riskLevel,
    suggestDoctor: true,
  });
  const role = getRecommendedRole(params.question);

  return {
    summary:
      params.summary?.trim() ||
      generated.doctorSummary.replace("建议由", "Claw 已帮您整理，建议由"),
    recommendedRole: params.recommendedRole || role.role,
    recommendedRoleLabel: params.recommendedRoleLabel || role.displayLabel,
    recommendedReason: params.recommendedReason || role.reason,
    preparedMaterials:
      params.preparedMaterials?.filter(Boolean) || generated.prepareItems,
  };
}

function getDefaultStatusNote(status: DoctorTodoRow["status"]) {
  if (status === "processing") {
    return "家医团队正在处理。";
  }
  if (status === "done") {
    return "家医团队已更新处理状态。";
  }
  if (status === "ignored") {
    return "该提醒已关闭。";
  }
  return "已提交给家医团队。";
}

export function buildServiceTimeline(params: {
  createdAt: string;
  status: DoctorTodoRow["status"];
  recommendedRoleLabel?: string;
  statusEvents?: TodoStatusEvent[];
}) {
  const items: TodoStatusEvent[] = [
    {
      id: `seed-submit-${params.createdAt}`,
      todoId: "",
      oldStatus: null,
      newStatus: "pending",
      note: "已提交给家医团队。",
      createdAt: params.createdAt,
    },
  ];

  if (params.recommendedRoleLabel) {
    items.push({
      id: `seed-assign-${params.createdAt}`,
      todoId: "",
      oldStatus: "pending",
      newStatus: "pending",
      note: `建议携带材料联系${params.recommendedRoleLabel}。`,
      createdAt: params.createdAt,
    });
  }

  const existing = (params.statusEvents ?? []).slice().sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  if (existing.length) {
    return [...items, ...existing];
  }

  if (params.status !== "pending") {
    items.push({
      id: `seed-status-${params.status}-${params.createdAt}`,
      todoId: "",
      oldStatus: "pending",
      newStatus: params.status,
      note: getDefaultStatusNote(params.status),
      createdAt: params.createdAt,
    });
  }

  return items;
}

export function mapRemoteTodoToProgress(params: {
  todo: DoctorTodoRow;
  residentName: string;
  statusEvents?: TodoStatusEvent[];
}) {
  const question = params.todo.original_question || params.todo.title || "居民问题";
  const fields = buildSummaryFields({
    question,
    clawAnswer: params.todo.claw_answer,
    riskLevel: params.todo.risk_level,
  });

  return {
    id: params.todo.id,
    residentId: params.todo.resident_id,
    residentName: params.residentName,
    title: params.todo.title || question,
    originalQuestion: question,
    clawAnswer: params.todo.claw_answer || "Claw 已帮您整理这条问题，方便后续沟通。",
    summary: fields.summary,
    recommendedRole: fields.recommendedRole,
    recommendedRoleLabel: fields.recommendedRoleLabel,
    recommendedReason: fields.recommendedReason,
    preparedMaterials: fields.preparedMaterials,
    riskLevel: params.todo.risk_level,
    status: params.todo.status,
    createdAt: params.todo.created_at,
    updatedAt: params.todo.updated_at ?? params.todo.created_at,
    statusEvents: buildServiceTimeline({
      createdAt: params.todo.created_at,
      status: params.todo.status,
      recommendedRoleLabel: fields.recommendedRoleLabel,
      statusEvents: params.statusEvents,
    }),
  } satisfies ResidentTodoProgressItem;
}

export function mapLocalTodoToProgress(params: {
  todo: DemoDoctorTodo;
  statusEvents?: TodoStatusEvent[];
}) {
  const question = params.todo.originalQuestion || params.todo.question;
  const fields = buildSummaryFields({
    question,
    clawAnswer: params.todo.clawAnswer,
    riskLevel: params.todo.riskLevel,
    recommendedRole: params.todo.recommendedRole,
    recommendedRoleLabel: params.todo.recommendedRoleLabel,
    recommendedReason: params.todo.recommendedReason,
    summary: params.todo.summary,
    preparedMaterials: params.todo.preparedMaterials,
  });

  const timeline = buildServiceTimeline({
    createdAt: params.todo.createdAt,
    status: params.todo.status,
    recommendedRoleLabel: fields.recommendedRoleLabel,
    statusEvents: params.statusEvents,
  });

  return {
    id: params.todo.id,
    residentId: params.todo.residentId ?? null,
    residentName: params.todo.residentName,
    title: params.todo.question,
    originalQuestion: question,
    clawAnswer: params.todo.clawAnswer || "Claw 已帮您整理这条问题，方便后续沟通。",
    summary: fields.summary,
    recommendedRole: fields.recommendedRole,
    recommendedRoleLabel: fields.recommendedRoleLabel,
    recommendedReason: fields.recommendedReason,
    preparedMaterials: fields.preparedMaterials,
    riskLevel: params.todo.riskLevel,
    status: params.todo.status,
    createdAt: params.todo.createdAt,
    updatedAt: timeline[timeline.length - 1]?.createdAt ?? params.todo.createdAt,
    statusEvents: timeline,
  } satisfies ResidentTodoProgressItem;
}

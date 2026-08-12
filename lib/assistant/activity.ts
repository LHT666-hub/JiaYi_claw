import type { AskReply, ServiceRequestPayload } from "@/lib/types";
import type { AssistantAction } from "./actions";

export type AssistantActivityType =
  | "public_info_query"
  | "schedule_query"
  | "service_draft_prepared"
  | "safety_guidance"
  | "general_guidance";

export type AssistantServiceType =
  | "clinic_registration"
  | "family_doctor_booking"
  | "refill_request"
  | "dispense_status_query"
  | "followup_reminder"
  | "report_explanation"
  | "referral_assistance"
  | "other";

export type AssistantActivityDescriptor = {
  activityType: AssistantActivityType;
  serviceType: AssistantServiceType | null;
  riskLevel: "low" | "medium" | "high" | "emergency";
  source: string;
  skillIds: string[];
  knowledgeRefs: string[];
  actionKinds: string[];
};

export type AssistantActivityView = {
  id: string;
  type: AssistantActivityType;
  title: string;
  detail: string;
  badge: string;
  riskLevel: "low" | "medium" | "high" | "emergency";
  occurredAt: string;
  primaryAction: { label: string; href: string } | null;
};

const SERVICE_KIND_TO_TYPE: Partial<
  Record<ServiceRequestPayload["kind"], AssistantServiceType>
> = {
  registration: "clinic_registration",
  family_doctor: "family_doctor_booking",
  refill: "refill_request",
  dispense_status: "dispense_status_query",
  followup: "followup_reminder",
  referral: "referral_assistance",
  community_activity: "other",
};

const SERVICE_PRESENTATION: Record<
  AssistantServiceType,
  { label: string; href: string }
> = {
  clinic_registration: {
    label: "挂号协助",
    href: "/appointments?type=clinic_registration&from=claw",
  },
  family_doctor_booking: {
    label: "家医预约",
    href: "/appointments?type=family_doctor_booking&from=claw",
  },
  refill_request: {
    label: "续方申请",
    href: "/appointments?type=refill_request&from=claw",
  },
  dispense_status_query: {
    label: "配药查询",
    href: "/appointments?type=dispense_status_query&from=claw",
  },
  followup_reminder: {
    label: "随访安排",
    href: "/appointments?type=followup_reminder&from=claw",
  },
  report_explanation: {
    label: "报告整理",
    href: "/appointments?type=report_explanation&from=claw",
  },
  referral_assistance: {
    label: "转诊协助",
    href: "/appointments?type=referral_assistance&from=claw",
  },
  other: { label: "服务申请", href: "/appointments?from=claw" },
};

export function buildAssistantActivity(params: {
  reply: AskReply;
  actions: AssistantAction[];
  serviceRequest: ServiceRequestPayload | null;
  skillIds: string[];
}): AssistantActivityDescriptor {
  const { reply, actions, serviceRequest, skillIds } = params;
  const serviceType = serviceRequest
    ? (SERVICE_KIND_TO_TYPE[serviceRequest.kind] ?? null)
    : reply.suggestDoctor
      ? "family_doctor_booking"
      : null;

  let activityType: AssistantActivityType = "general_guidance";
  if (reply.riskLevel === "emergency") activityType = "safety_guidance";
  else if (serviceType || actions.some((action) => action.kind === "service"))
    activityType = "service_draft_prepared";
  else if (reply.agentResult?.intent === "doctor_schedule_query")
    activityType = "schedule_query";
  else if (reply.knowledgeIds?.length) activityType = "public_info_query";

  return {
    activityType,
    serviceType,
    riskLevel: reply.riskLevel,
    source: String(reply.source || "fallback").slice(0, 40),
    skillIds: [...new Set(skillIds)].slice(0, 12),
    knowledgeRefs: [...new Set(reply.knowledgeIds ?? [])].slice(0, 20),
    actionKinds: [...new Set(actions.map((action) => action.kind))].slice(0, 8),
  };
}

export function presentAssistantActivity(row: {
  id: string;
  activity_type: AssistantActivityType;
  service_type: AssistantServiceType | null;
  risk_level: AssistantActivityView["riskLevel"];
  created_at: string;
}): AssistantActivityView {
  if (row.activity_type === "safety_guidance") {
    return {
      id: row.id,
      type: row.activity_type,
      title: "已完成安全分流",
      detail: "已提示紧急处置方式，线上服务不会替代急救。",
      badge: "安全",
      riskLevel: row.risk_level,
      occurredAt: row.created_at,
      primaryAction: { label: "拨打 120", href: "tel:120" },
    };
  }

  if (row.activity_type === "service_draft_prepared") {
    const service = row.service_type
      ? SERVICE_PRESENTATION[row.service_type]
      : SERVICE_PRESENTATION.other;
    return {
      id: row.id,
      type: row.activity_type,
      title: `已整理${service.label}草稿`,
      detail: "原对话未保存；核对资料后才会提交给家医团队。",
      badge: "待确认",
      riskLevel: row.risk_level,
      occurredAt: row.created_at,
      primaryAction: { label: "继续办理", href: service.href },
    };
  }

  if (row.activity_type === "schedule_query") {
    return {
      id: row.id,
      type: row.activity_type,
      title: "查询了医生排班",
      detail: "可继续查看所属家医网络内已核验的坐班信息。",
      badge: "已核验",
      riskLevel: row.risk_level,
      occurredAt: row.created_at,
      primaryAction: { label: "查看排班", href: "/services" },
    };
  }

  if (row.activity_type === "public_info_query") {
    return {
      id: row.id,
      type: row.activity_type,
      title: "查询了公开服务信息",
      detail: "回答来自已审核知识库，可继续核对来源和有效期。",
      badge: "有来源",
      riskLevel: row.risk_level,
      occurredAt: row.created_at,
      primaryAction: { label: "查看信息", href: "/public-info" },
    };
  }

  return {
    id: row.id,
    type: row.activity_type,
    title: "完成一次 Claw 整理",
    detail: "完整问答没有保存；需要办理时请生成并确认服务申请。",
    badge: "已完成",
    riskLevel: row.risk_level,
    occurredAt: row.created_at,
    primaryAction: null,
  };
}

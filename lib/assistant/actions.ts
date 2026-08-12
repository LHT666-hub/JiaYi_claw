import type { AskReply, ServiceRequestPayload } from "../types";

export type AssistantAction = {
  id: string;
  kind: "service" | "schedule" | "public_info" | "progress" | "emergency";
  label: string;
  description: string;
  href: string;
  requiresConfirmation: boolean;
};

function appointmentHref(
  serviceType: string,
  question: string,
  serviceRequest: ServiceRequestPayload,
) {
  const params = new URLSearchParams({ type: serviceType, from: "claw" });
  const target =
    serviceRequest.kind === "registration"
      ? serviceRequest.symptom || question
      : serviceRequest.kind === "refill"
        ? `续方配药：${serviceRequest.medicineName || question}`
        : serviceRequest.kind === "family_doctor"
          ? serviceRequest.note || question
          : serviceRequest.kind === "followup"
            ? `随访安排：${serviceRequest.note || question}`
            : serviceRequest.kind === "referral"
              ? serviceRequest.target || question
              : serviceRequest.kind === "community_activity"
                ? `报名参加：${serviceRequest.activityTitle}`
            : question;
  params.set("target", target.slice(0, 160));

  if (serviceRequest.kind === "registration") {
    if (serviceRequest.department)
      params.set("department", serviceRequest.department);
    if (serviceRequest.preferredDoctor)
      params.set("doctor", serviceRequest.preferredDoctor);
    const preference = [
      serviceRequest.preferredDate,
      serviceRequest.preferredTime,
    ]
      .filter(Boolean)
      .join("");
    if (preference)
      params.set("note", `Claw 识别的期望时段：${preference}，请确认后提交。`);
  }
  if (serviceRequest.kind === "refill") {
    const note = [serviceRequest.disease, serviceRequest.stockLeft]
      .filter(Boolean)
      .join("；");
    if (note) params.set("note", note);
  }
  if (serviceRequest.kind === "family_doctor") {
    const preference = [
      serviceRequest.preferredDate,
      serviceRequest.preferredTime,
    ]
      .filter(Boolean)
      .join("");
    if (preference)
      params.set("note", `期望时段：${preference}，请确认后提交。`);
  }
  if (serviceRequest.kind === "followup" && serviceRequest.preferredDate) {
    params.set(
      "note",
      `期望时间：${serviceRequest.preferredDate}，请确认后提交。`,
    );
  }
  if (serviceRequest.kind === "referral") {
    if (serviceRequest.department) params.set("department", serviceRequest.department);
    const referralNote = [
      serviceRequest.institution ? `希望转诊机构：${serviceRequest.institution}` : "",
      [serviceRequest.preferredDate, serviceRequest.preferredTime].filter(Boolean).length
        ? `期望时段：${[serviceRequest.preferredDate, serviceRequest.preferredTime].filter(Boolean).join("")}`
        : "",
    ].filter(Boolean).join("；");
    if (referralNote) params.set("note", `${referralNote}，由家医团队评估后确认。`);
  }
  if (serviceRequest.kind === "community_activity") {
    params.set("contentId", serviceRequest.contentId);
    params.set("note", `信息来源：${serviceRequest.sourceName || "已审核官方内容"}。请团队核对活动条件和报名方式。`);
  }

  return `/appointments?${params.toString()}`;
}

export function buildAssistantActions(params: {
  question: string;
  reply: AskReply;
  serviceRequest: ServiceRequestPayload | null;
}): AssistantAction[] {
  const { question, reply, serviceRequest } = params;
  if (reply.riskLevel === "emergency") {
    return [
      {
        id: "call-120",
        kind: "emergency",
        label: "立即拨打 120",
        description: "紧急情况不要等待线上回复。",
        href: "tel:120",
        requiresConfirmation: false,
      },
    ];
  }

  if (serviceRequest) {
    const config =
      serviceRequest.kind === "registration"
        ? {
            type: "clinic_registration",
            label: "核对并发起挂号协助",
            description: "Claw 已整理诉求，您确认资料后才会提交给家医团队。",
          }
        : serviceRequest.kind === "family_doctor"
          ? {
              type: "family_doctor_booking",
              label: "核对并预约家庭医生",
              description: "确认服务方式和时间后再发送给家医团队。",
            }
          : serviceRequest.kind === "refill"
            ? {
                type: "refill_request",
                label: "核对并发起续方申请",
                description: "医生和药师会核对处方、复诊要求与实时库存。",
              }
            : serviceRequest.kind === "followup"
              ? {
                  type: "followup_reminder",
                  label: "核对并安排随访",
                  description: "确认随访时间和方式后再提交。",
                }
              : serviceRequest.kind === "referral"
                ? {
                    type: "referral_assistance",
                    label: "核对并申请转诊协助",
                    description: "先由所属家医团队评估，再协助对接合作医院和科室。",
                  }
                : serviceRequest.kind === "community_activity"
                  ? {
                      type: "other",
                      label: "核对并申请活动报名",
                      description: "团队会依据已审核原文核对名额、对象和报名方式。",
                    }
              : null;
    if (config) {
      return [
        {
          id: `start-${config.type}`,
          kind: "service",
          label: config.label,
          description: config.description,
          href: appointmentHref(config.type, question, serviceRequest),
          requiresConfirmation: true,
        },
        {
          id: "view-progress",
          kind: "progress",
          label: "查看已有服务进度",
          description: "避免重复提交，先看看团队是否已经在处理。",
          href: "/appointments",
          requiresConfirmation: false,
        },
      ];
    }
  }

  if (reply.agentResult?.intent === "doctor_schedule_query") {
    return [
      {
        id: "verified-schedules",
        kind: "schedule",
        label: "查看已核验排班",
        description: "只展示机构负责人核验过的医生、科室和服务时间。",
        href: "/services",
        requiresConfirmation: false,
      },
    ];
  }

  if (reply.knowledgeIds?.length) {
    return [
      {
        id: "public-info-source",
        kind: "public_info",
        label: "查看来源与有效期",
        description: "核对发布机构、核验时间和原文入口。",
        href: `/public-info?q=${encodeURIComponent(question)}`,
        requiresConfirmation: false,
      },
    ];
  }

  if (reply.suggestDoctor) {
    const query = new URLSearchParams({
      type: "family_doctor_booking",
      from: "claw",
      target: question.slice(0, 160),
    });
    return [
      {
        id: "contact-family-doctor",
        kind: "service",
        label: "整理后咨询家医团队",
        description: "Claw 只生成草稿，您确认后才会发送。",
        href: `/appointments?${query.toString()}`,
        requiresConfirmation: true,
      },
    ];
  }

  return [];
}

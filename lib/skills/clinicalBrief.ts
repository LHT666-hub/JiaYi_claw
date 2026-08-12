import type { AppointmentIntake, MedicalEntityResult } from "@jiayi/contracts";

function sentence(value: string) {
  const normalized = value.trim();
  return /[。！？!?]$/.test(normalized) ? normalized : `${normalized}。`;
}

export function buildClinicianBrief(input: {
  residentName: string;
  question: string;
  entities: MedicalEntityResult;
  appointment?: AppointmentIntake;
  sourceContext?: { id: string; title: string; sourceName: string; reviewedAt: string | null } | null;
}) {
  const facts: string[] = [];
  if (input.entities.symptoms.length) {
    facts.push(`居民提到：${input.entities.symptoms.map((item) => item.name).join("、")}`);
  }
  if (input.entities.medications.length) {
    facts.push(`居民提到的药品：${input.entities.medications.map((item) => `${item.name}${item.dosage ? ` ${item.dosage}` : ""}`).join("、")}`);
  }
  if (input.entities.measurements.length) {
    facts.push(`居民提供的指标：${input.entities.measurements.map((item) => `${item.type} ${item.value}${item.unit ? ` ${item.unit}` : ""}`).join("；")}`);
  }
  if (input.appointment) {
    facts.push(`预约目标：${input.appointment.target}`);
    if (input.appointment.preferredDates.length) facts.push(`希望日期：${input.appointment.preferredDates.join("、")}`);
  }
  if (input.sourceContext) {
    facts.push(`关联已审核内容：${input.sourceContext.title}（${input.sourceContext.sourceName}）`);
  }

  const missing = [...input.entities.missingInformation];
  if (!facts.length) missing.push("尚未提取到可核对的健康事实");

  return {
    summary: `${input.residentName}本次主要诉求：${sentence(input.question)}${facts.length ? sentence(facts.join("；")) : ""}`,
    structuredContent: {
      residentReportedFacts: facts,
      mentionedConditions: input.entities.mentionedConditions,
      requestedActions: input.entities.requestedActions,
      missingInformation: missing,
      safetyNotice: "本摘要仅整理居民原话和已提交数据，不代表诊断或治疗建议。",
    },
    sourceRefs: [
      "resident_question",
      ...(input.appointment ? ["appointment_intake"] : []),
      ...(input.sourceContext ? [`content:${input.sourceContext.id}`] : []),
    ],
  };
}

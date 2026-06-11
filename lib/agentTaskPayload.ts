import type {
  AppRole,
  AgentResult,
  AgentServiceFact,
  AgentTaskCard,
  AgentWorkflowStep,
  PersistedServiceTask,
  ServiceRequestPayload,
} from "@/lib/types";

const SERVICE_TASK_PREFIX = "[[claw_service_task:";
const SERVICE_TASK_SUFFIX = "]]";

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text) as PersistedServiceTask;
  } catch {
    return null;
  }
}

function buildRefillNormalizedSteps(
  residentStep?: AgentWorkflowStep,
  doctorStep?: AgentWorkflowStep,
  completed = false,
  stageIndex = 0,
): AgentWorkflowStep[] {
  const steps: AgentWorkflowStep[] = [
    {
      title: residentStep?.title ?? "提交续方申请",
      owner: residentStep?.owner ?? "居民",
      ownerRole: "resident",
      status: "pending",
    },
    {
      title: doctorStep?.title ?? "医生审核是否可续方",
      owner: doctorStep?.owner ?? "家庭医生",
      ownerRole: "doctor",
      status: "pending",
    },
    {
      title: "药师审方",
      owner: "药师",
      ownerRole: "pharmacist",
      status: "pending",
    },
    {
      title: "药房配药",
      owner: "药房",
      ownerRole: "pharmacist",
      status: "pending",
    },
    {
      title: "确认自取或邮寄",
      owner: "药师 / 药房",
      ownerRole: "pharmacist",
      status: "pending",
    },
  ];

  if (completed) {
    return steps.map((step) => ({ ...step, status: "done" as const }));
  }

  return steps.map((step, index) => ({
    ...step,
    status:
      index < stageIndex
        ? ("done" as const)
        : index === stageIndex
          ? ("current" as const)
          : ("pending" as const),
  }));
}

function normalizeRefillSteps(steps: AgentWorkflowStep[]) {
  if (steps.length !== 3) {
    return steps;
  }

  const lastStep = steps[2];
  if (lastStep.ownerRole !== "pharmacist") {
    return steps;
  }

  const currentIndex = steps.findIndex((step) => step.status === "current");
  const completedCount = steps.filter((step) => step.status === "done").length;

  if (currentIndex < 0 && completedCount >= 3) {
    return buildRefillNormalizedSteps(steps[0], steps[1], true);
  }

  const stageIndex =
    currentIndex >= 0
      ? currentIndex === 2
        ? 2
        : currentIndex
      : completedCount >= 2
        ? 4
        : completedCount;

  return buildRefillNormalizedSteps(steps[0], steps[1], false, stageIndex);
}

function inferServiceFacts(task: AgentTaskCard): AgentServiceFact[] {
  if (task.intent === "refill_request") {
    return [
      { label: "既往处方", value: "已进入待核验队列", tone: "positive" },
      { label: "可续方目录", value: "待医生确认是否满足续方条件", tone: "neutral" },
      { label: "药房库存", value: "待药师或药房核对", tone: "neutral" },
      { label: "是否需线下复诊", value: "待医生评估", tone: "warning" },
      { label: "交付方式", value: "支持自取或邮寄，待确认", tone: "neutral" },
    ];
  }

  if (task.intent === "clinic_registration") {
    return [
      { label: "预约目标", value: "已识别就诊需求并生成挂号协助", tone: "positive" },
      { label: "号源确认", value: "待导诊或社区前台锁定号源", tone: "neutral" },
      {
        label: "候选医生",
        value: task.doctorOptions?.length ? `已推荐 ${task.doctorOptions.length} 位候选医生` : "待匹配",
        tone: "neutral",
      },
      { label: "到诊材料", value: "身份证、医保卡、就诊人信息需准备齐全", tone: "warning" },
    ];
  }

  if (task.intent === "doctor_schedule_query") {
    return [
      {
        label: "排班结果",
        value: task.doctorOptions?.length ? `已匹配 ${task.doctorOptions.length} 位可选医生` : "暂无匹配结果",
        tone: "positive",
      },
      { label: "号源状态", value: "可继续查看余号并一键发起预约", tone: "neutral" },
    ];
  }

  if (task.intent === "family_doctor_booking") {
    return [
      { label: "预约类型", value: "家庭医生服务时段协调中", tone: "positive" },
      { label: "联系窗口", value: "由家医团队进一步确认时间", tone: "neutral" },
    ];
  }

  if (task.intent === "dispense_status_query") {
    return [
      { label: "服务状态", value: "已进入配药进度查询", tone: "positive" },
      { label: "下一动作", value: "待药师或药房同步最新处理状态", tone: "neutral" },
    ];
  }

  return [
    { label: "服务类型", value: "已生成随访提醒任务", tone: "positive" },
    { label: "下一动作", value: "待团队确认随访时间和回执方式", tone: "neutral" },
  ];
}

function normalizeServiceTask(serviceTask: PersistedServiceTask | null) {
  if (!serviceTask) {
    return null;
  }

  const normalizedSteps =
    serviceTask.task.intent === "refill_request"
      ? normalizeRefillSteps(serviceTask.task.steps)
      : serviceTask.task.steps;

  const normalizedTask: AgentTaskCard = {
    ...serviceTask.task,
    steps: normalizedSteps,
    serviceFacts:
      serviceTask.task.serviceFacts?.length
        ? serviceTask.task.serviceFacts
        : inferServiceFacts({ ...serviceTask.task, steps: normalizedSteps }),
  };

  return {
    ...serviceTask,
    task: normalizedTask,
  };
}

export function buildPersistedServiceTask(
  agentResult?: AgentResult | null,
  serviceRequest?: ServiceRequestPayload | null,
) {
  const task = agentResult?.cards?.[0];

  if (!agentResult || !task) {
    return null;
  }

  return normalizeServiceTask({
    label: agentResult.label,
    needsHumanReview: agentResult.needsHumanReview,
    task,
    serviceRequest: serviceRequest ?? null,
  } satisfies PersistedServiceTask);
}

export function encodeDescriptionWithServiceTask(
  plainDescription: string | null | undefined,
  serviceTask?: PersistedServiceTask | null,
) {
  const base = plainDescription?.trim() ?? "";
  const normalizedTask = normalizeServiceTask(serviceTask ?? null);

  if (!normalizedTask) {
    return base || null;
  }

  const serialized = JSON.stringify(normalizedTask);
  return `${base}${base ? "\n\n" : ""}${SERVICE_TASK_PREFIX}${serialized}${SERVICE_TASK_SUFFIX}`;
}

export function parseDescriptionWithServiceTask(description: string | null | undefined) {
  const value = description?.trim() ?? "";

  if (!value) {
    return {
      plainDescription: null,
      serviceTask: null,
    };
  }

  const start = value.indexOf(SERVICE_TASK_PREFIX);
  const end = value.indexOf(SERVICE_TASK_SUFFIX, start + SERVICE_TASK_PREFIX.length);

  if (start < 0 || end < 0) {
    return {
      plainDescription: value,
      serviceTask: null,
    };
  }

  const jsonText = value.slice(start + SERVICE_TASK_PREFIX.length, end);
  const parsed = normalizeServiceTask(safeJsonParse(jsonText));
  const before = value.slice(0, start).trim();
  const after = value.slice(end + SERVICE_TASK_SUFFIX.length).trim();
  const plainDescription = [before, after].filter(Boolean).join("\n\n").trim();

  return {
    plainDescription: plainDescription || null,
    serviceTask: parsed,
  };
}

export function buildServiceTaskTitle(task: AgentTaskCard) {
  if (task.intent === "clinic_registration") {
    return "挂号预约协助";
  }

  if (task.intent === "doctor_schedule_query") {
    return "排班查询协助";
  }

  if (task.intent === "family_doctor_booking") {
    return "家医预约协助";
  }

  if (task.intent === "refill_request") {
    return "续方配药申请";
  }

  if (task.intent === "dispense_status_query") {
    return "配药进度查询";
  }

  return "随访提醒协助";
}

export function getCurrentServiceOwnerRole(serviceTask?: PersistedServiceTask | null) {
  return (
    normalizeServiceTask(serviceTask ?? null)?.task.steps.find((step) => step.status === "current")
      ?.ownerRole ?? null
  );
}

export function getCurrentServiceOwnerLabel(serviceTask?: PersistedServiceTask | null) {
  return (
    normalizeServiceTask(serviceTask ?? null)?.task.steps.find((step) => step.status === "current")
      ?.owner ?? null
  );
}

export function getCurrentServiceStepTitle(serviceTask?: PersistedServiceTask | null) {
  return (
    normalizeServiceTask(serviceTask ?? null)?.task.steps.find((step) => step.status === "current")
      ?.title ?? null
  );
}

export function getNextPendingServiceStepTitle(serviceTask?: PersistedServiceTask | null) {
  const normalizedTask = normalizeServiceTask(serviceTask ?? null);
  const currentIndex = normalizedTask?.task.steps.findIndex((step) => step.status === "current") ?? -1;

  if (!normalizedTask || currentIndex < 0) {
    return null;
  }

  return normalizedTask.task.steps.find((step, index) => index > currentIndex && step.status === "pending")?.title ?? null;
}

export function getServiceFactValue(
  serviceTask: PersistedServiceTask | null | undefined,
  label: string,
) {
  return (
    normalizeServiceTask(serviceTask ?? null)?.task.serviceFacts?.find((fact) => fact.label === label)
      ?.value ?? null
  );
}

export function buildResidentServiceUpdateCopy(
  serviceTask: PersistedServiceTask | null | undefined,
  status: "processing" | "done",
  fallback: string,
) {
  const normalizedTask = normalizeServiceTask(serviceTask ?? null);

  if (!normalizedTask) {
    return {
      title: status === "processing" ? "服务任务已流转到下一节点" : "服务任务已处理完成",
      content: fallback,
    };
  }

  if (status === "processing") {
    return {
      title: "服务任务已流转到下一节点",
      content: fallback,
    };
  }

  if (normalizedTask.task.intent === "clinic_registration") {
    return {
      title: "门诊预约已完成",
      content:
        getServiceFactValue(normalizedTask, "号源确认") ??
        "门诊预约已完成，请按约定时间携带证件到院就诊。",
    };
  }

  if (normalizedTask.task.intent === "refill_request") {
    const delivery = getServiceFactValue(normalizedTask, "交付方式");
    return {
      title: "续方配药已完成",
      content:
        delivery ??
        getServiceFactValue(normalizedTask, "药房库存") ??
        "续方配药流程已完成，请留意后续取药或配送通知。",
    };
  }

  if (normalizedTask.task.intent === "family_doctor_booking") {
    return {
      title: "家医服务已安排",
      content:
        getServiceFactValue(normalizedTask, "联系窗口") ??
        "家庭医生团队已安排服务时段，请留意电话或面诊通知。",
    };
  }

  if (normalizedTask.task.intent === "dispense_status_query") {
    return {
      title: "配药结果已更新",
      content:
        getServiceFactValue(normalizedTask, "服务状态") ??
        getServiceFactValue(normalizedTask, "交付方式") ??
        "配药结果已更新，请查看最新进度。",
    };
  }

  return {
    title: "随访安排已更新",
    content:
      getServiceFactValue(normalizedTask, "下一动作") ??
      "随访任务已完成，请按约定时间配合后续回访或复诊。",
  };
}

export function buildResidentFriendlyTaskSnapshot(
  serviceTask: PersistedServiceTask | null | undefined,
  status: "pending" | "processing" | "done" | "ignored",
) {
  const normalizedTask = normalizeServiceTask(serviceTask ?? null);

  if (!normalizedTask) {
    return {
      headline:
        status === "done"
          ? "这件事已经办好了。"
          : status === "processing"
            ? "家医团队正在继续处理。"
            : "已经提交给家医团队。",
      nextAction: "有新结果时会继续回写到这里。",
    };
  }

  if (status === "done") {
    const doneCopy = buildResidentServiceUpdateCopy(
      normalizedTask,
      "done",
      "服务已经处理完成，请查看最新结果。",
    );
    return {
      headline: doneCopy.title,
      nextAction: doneCopy.content,
    };
  }

  if (normalizedTask.task.intent === "clinic_registration") {
    return {
      headline: "正在帮您确认号源和预约结果。",
      nextAction:
        getServiceFactValue(normalizedTask, "下一动作") ??
        getServiceFactValue(normalizedTask, "号源确认") ??
        "请留意最终预约结果回写。",
    };
  }

  if (normalizedTask.task.intent === "refill_request") {
    return {
      headline: "正在按续方流程核对药品和库存。",
      nextAction:
        getServiceFactValue(normalizedTask, "是否需线下复诊") ??
        getServiceFactValue(normalizedTask, "药房库存") ??
        "请准备好最近的用药和检查记录。",
    };
  }

  if (normalizedTask.task.intent === "family_doctor_booking") {
    return {
      headline: "家医团队正在帮您确认服务时段。",
      nextAction:
        getServiceFactValue(normalizedTask, "联系窗口") ??
        "请留意家医团队来电或短信。",
    };
  }

  if (normalizedTask.task.intent === "dispense_status_query") {
    return {
      headline: "正在帮您查看配药到了哪一步。",
      nextAction:
        getServiceFactValue(normalizedTask, "服务状态") ??
        "药师或药房更新后会同步到这里。",
    };
  }

  return {
    headline: "正在帮您安排后续随访和提醒。",
    nextAction:
      getServiceFactValue(normalizedTask, "下一动作") ??
      "请留意接下来的回访或复诊提醒。",
  };
}

export function advanceServiceTask(serviceTask?: PersistedServiceTask | null) {
  const normalizedTask = normalizeServiceTask(serviceTask ?? null);

  if (!normalizedTask) {
    return null;
  }

  const currentIndex = normalizedTask.task.steps.findIndex((step) => step.status === "current");

  if (currentIndex < 0) {
    return {
      serviceTask: normalizedTask,
      nextOwnerRole: null,
      completed: true,
      currentStepTitle: null,
    };
  }

  const steps = normalizedTask.task.steps.map((step, index) => {
    if (index === currentIndex) {
      return { ...step, status: "done" as const };
    }
    return { ...step };
  });

  const nextIndex = steps.findIndex((step, index) => index > currentIndex && step.status === "pending");

  if (nextIndex >= 0) {
    steps[nextIndex] = { ...steps[nextIndex], status: "current" as const };
  }

  const nextServiceTask = normalizeServiceTask({
    ...normalizedTask,
    task: {
      ...normalizedTask.task,
      steps,
    },
  });

  return {
    serviceTask: nextServiceTask,
    nextOwnerRole: nextIndex >= 0 ? steps[nextIndex].ownerRole ?? null : null,
    completed: nextIndex < 0,
    currentStepTitle: nextIndex >= 0 ? steps[nextIndex].title : null,
  };
}

export function updateServiceTaskFacts(
  serviceTask: PersistedServiceTask | null | undefined,
  updates?: Array<{ label: string; value: string; tone?: AgentServiceFact["tone"] }> | null,
) {
  const normalizedTask = normalizeServiceTask(serviceTask ?? null);

  if (!normalizedTask || !updates?.length) {
    return normalizedTask;
  }

  const currentFacts = normalizedTask.task.serviceFacts ?? [];
  const nextFacts = currentFacts.map((fact) => {
    const matched = updates.find((item) => item.label === fact.label);
    return matched ? { ...fact, value: matched.value, tone: matched.tone ?? fact.tone } : fact;
  });

  for (const update of updates) {
    if (!nextFacts.some((fact) => fact.label === update.label)) {
      nextFacts.push({
        label: update.label,
        value: update.value,
        tone: update.tone,
      });
    }
  }

  return {
    ...normalizedTask,
    task: {
      ...normalizedTask.task,
      serviceFacts: nextFacts,
    },
  } satisfies PersistedServiceTask;
}

export function normalizeAssignableRole(role?: AppRole | null) {
  if (!role || role === "resident" || role === "family" || role === "admin") {
    return null;
  }

  return role;
}

import type {
  AgentIntent,
  AgentResult,
  AgentTaskCard,
  AgentWorkflowStep,
  AskReply,
  DispenseStatusServiceRequest,
  FamilyDoctorServiceRequest,
  FollowupServiceRequest,
  RegistrationServiceRequest,
  ReferralServiceRequest,
  RefillServiceRequest,
  RiskLevel,
  ServiceRequestPayload,
} from "@/lib/types";

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function hasActionCue(text: string) {
  return includesAny(text, [
    "帮我",
    "给我",
    "我要",
    "我想",
    "想要",
    "申请",
    "发起",
    "办理",
    "安排",
    "预约",
    "约一下",
    "约个",
    "挂号",
    "续方",
    "续药",
    "开一下药",
    "提醒我",
  ]);
}

function isInformationLookup(text: string) {
  return includesAny(text, [
    "怎么查",
    "哪里查",
    "在哪查",
    "什么时候",
    "几点",
    "地址",
    "电话",
    "有什么区别",
    "区别",
    "是什么意思",
    "什么意思",
    "怎么办",
  ]);
}

function createSteps(
  currentIndex: number,
  steps: Array<{
    title: string;
    owner: string;
    ownerRole?: AgentWorkflowStep["ownerRole"];
  }>,
): AgentWorkflowStep[] {
  return steps.map((step, index) => ({
    ...step,
    status:
      index < currentIndex
        ? "done"
        : index === currentIndex
          ? "current"
          : "pending",
  }));
}

function createCard(params: Omit<AgentTaskCard, "id">): AgentTaskCard {
  return {
    id: `agent-card-${params.intent}-${Math.random().toString(36).slice(2, 8)}`,
    ...params,
  };
}

function inferPreferredDate(question: string) {
  if (includesAny(question, ["今天", "今儿"])) {
    return "今天";
  }

  if (includesAny(question, ["后天"])) {
    return "后天";
  }

  if (includesAny(question, ["本周", "这周"])) {
    return "本周";
  }

  return "明天";
}

function inferPreferredTime(question: string) {
  if (includesAny(question, ["上午", "早上"])) {
    return "上午";
  }

  if (includesAny(question, ["晚上", "晚点"])) {
    return "晚上";
  }

  if (includesAny(question, ["全天"])) {
    return "全天";
  }

  return "下午";
}

function inferRegistrationDepartment(question: string) {
  if (includesAny(question, ["心内科", "心血管", "心脏", "胸闷", "心慌", "冠心病"])) {
    return "心血管门诊";
  }

  if (includesAny(question, ["关节", "膝盖", "腰", "腿", "骨头"])) {
    return "关节与疼痛门诊";
  }

  if (includesAny(question, ["高血压", "血压"])) {
    return "高血压 / 慢病门诊";
  }

  return "";
}

function inferReferralInstitution(question: string) {
  const match = question.match(/(?:转诊|上转|转院|转到|转去)(?:到|去)?([一-龥]{2,24}(?:医院|卫生服务中心))/);
  return match?.[1]?.trim() ?? "";
}

function inferRegistrationSymptom(question: string) {
  if (includesAny(question, ["心脏", "胸闷", "心慌", "冠心病"])) {
    return "心脏不适 / 心血管问题";
  }

  if (includesAny(question, ["关节", "膝盖", "腰", "腿", "骨头"])) {
    return "关节疼痛 / 肌骨不适";
  }

  if (includesAny(question, ["高血压", "血压"])) {
    return "高血压复诊";
  }

  return "";
}

function inferPreferredDoctor(question: string) {
  const match = question.match(/([\u4e00-\u9fa5]{1,4})医生/);
  const name = match?.[1]?.trim() ?? "";
  return ["家", "家庭", "签约", "全科"].includes(name)
    ? ""
    : name
      ? `${name}医生`
      : "";
}

function inferRegistrationPayload(
  question: string,
): RegistrationServiceRequest {
  return {
    kind: "registration",
    symptom: inferRegistrationSymptom(question),
    department: inferRegistrationDepartment(question),
    preferredDate: inferPreferredDate(question),
    preferredTime: inferPreferredTime(question),
    preferredDoctor: inferPreferredDoctor(question),
  };
}

function mergeRegistrationPayload(
  question: string,
  payload?: RegistrationServiceRequest,
): RegistrationServiceRequest {
  const inferred = inferRegistrationPayload(question);
  return {
    kind: "registration",
    symptom: payload?.symptom?.trim() || inferred.symptom,
    department: payload?.department?.trim() || inferred.department,
    preferredDate: payload?.preferredDate?.trim() || inferred.preferredDate,
    preferredTime: payload?.preferredTime?.trim() || inferred.preferredTime,
    preferredDoctor:
      payload?.preferredDoctor?.trim() || inferred.preferredDoctor,
  };
}

function inferRefillMedicineName(question: string) {
  const medicineMatch = question.match(
    /(?:续|配|拿|开)([\u4e00-\u9fa5A-Za-z0-9·-]{2,20})(?:片|胶囊|药)?/,
  );
  if (medicineMatch?.[1]) return medicineMatch[1];

  if (question.includes("上次那个药")) {
    return "上次那个药";
  }

  return "";
}

function inferRefillDisease(question: string) {
  if (includesAny(question, ["高血压", "血压", "降压药"])) {
    return "高血压";
  }

  if (includesAny(question, ["糖尿病", "血糖", "降糖药"])) {
    return "糖尿病";
  }

  if (includesAny(question, ["心脏", "冠心病", "心血管"])) {
    return "心血管慢病";
  }

  return "";
}

function inferRefillStockLeft(question: string) {
  if (includesAny(question, ["快吃完", "快没了", "没药了", "不多了"])) {
    return "药快吃完了";
  }

  if (includesAny(question, ["还剩3天", "剩3天", "三天药"])) {
    return "还剩 3 天药量";
  }

  if (includesAny(question, ["还剩一周", "剩一周", "1周药"])) {
    return "还剩 1 周药量";
  }

  return "";
}

function inferRefillDeliveryMethod(
  question: string,
): RefillServiceRequest["deliveryMethod"] | undefined {
  if (includesAny(question, ["邮寄", "寄到家", "送到家", "配送"])) {
    return "mail";
  }

  if (includesAny(question, ["自取", "取药", "到店拿"])) {
    return "pickup";
  }

  if (question.includes("都可以")) {
    return "either";
  }

  return undefined;
}

function inferRefillPayload(question: string): RefillServiceRequest {
  return {
    kind: "refill",
    medicineName: inferRefillMedicineName(question),
    disease: inferRefillDisease(question),
    stockLeft: inferRefillStockLeft(question),
    deliveryMethod: inferRefillDeliveryMethod(question) ?? "either",
  };
}

function mergeRefillPayload(
  question: string,
  payload?: RefillServiceRequest,
): RefillServiceRequest {
  const inferred = inferRefillPayload(question);
  return {
    kind: "refill",
    medicineName: payload?.medicineName?.trim() || inferred.medicineName,
    disease: payload?.disease?.trim() || inferred.disease,
    stockLeft: payload?.stockLeft?.trim() || inferred.stockLeft,
    deliveryMethod:
      payload?.deliveryMethod ?? inferred.deliveryMethod ?? "either",
  };
}

function inferFamilyDoctorServiceMode(
  question: string,
): FamilyDoctorServiceRequest["serviceMode"] | undefined {
  if (includesAny(question, ["上门", "到家"])) {
    return "home_visit";
  }

  if (includesAny(question, ["电话", "回访", "来电"])) {
    return "phone";
  }

  if (includesAny(question, ["面诊", "当面", "门诊"])) {
    return "clinic";
  }

  return "either";
}

function inferFamilyDoctorPayload(
  question: string,
): FamilyDoctorServiceRequest {
  return {
    kind: "family_doctor",
    serviceMode: inferFamilyDoctorServiceMode(question) ?? "either",
    preferredDate: inferPreferredDate(question),
    preferredTime: inferPreferredTime(question),
    note: "",
  };
}

function mergeFamilyDoctorPayload(
  question: string,
  payload?: FamilyDoctorServiceRequest,
): FamilyDoctorServiceRequest {
  const inferred = inferFamilyDoctorPayload(question);
  return {
    kind: "family_doctor",
    serviceMode: payload?.serviceMode ?? inferred.serviceMode,
    preferredDate: payload?.preferredDate?.trim() || inferred.preferredDate,
    preferredTime: payload?.preferredTime?.trim() || inferred.preferredTime,
    note: payload?.note?.trim() || inferred.note,
  };
}

function inferDispenseProgressFocus(
  question: string,
): DispenseStatusServiceRequest["progressFocus"] | undefined {
  if (includesAny(question, ["审核", "审方"])) {
    return "review";
  }

  if (includesAny(question, ["配药", "配好", "备药"])) {
    return "dispense";
  }

  if (includesAny(question, ["邮寄", "寄出", "配送", "自取", "取药"])) {
    return "delivery";
  }

  return "any";
}

function inferDispenseStatusPayload(
  question: string,
): DispenseStatusServiceRequest {
  return {
    kind: "dispense_status",
    medicineName: inferRefillMedicineName(question),
    deliveryMethod: inferRefillDeliveryMethod(question) ?? "either",
    progressFocus: inferDispenseProgressFocus(question) ?? "any",
  };
}

function mergeDispenseStatusPayload(
  question: string,
  payload?: DispenseStatusServiceRequest,
): DispenseStatusServiceRequest {
  const inferred = inferDispenseStatusPayload(question);
  return {
    kind: "dispense_status",
    medicineName: payload?.medicineName?.trim() || inferred.medicineName,
    deliveryMethod:
      payload?.deliveryMethod ?? inferred.deliveryMethod ?? "either",
    progressFocus: payload?.progressFocus ?? inferred.progressFocus ?? "any",
  };
}

function inferFollowupType(
  question: string,
): FollowupServiceRequest["followupType"] | undefined {
  if (includesAny(question, ["电话随访", "电话回访"])) {
    return "phone_followup";
  }

  if (includesAny(question, ["复查", "检查"])) {
    return "checkup";
  }

  if (includesAny(question, ["用药提醒", "吃药提醒"])) {
    return "medication_reminder";
  }

  return "clinic_review";
}

function inferFollowupPayload(question: string): FollowupServiceRequest {
  return {
    kind: "followup",
    followupType: inferFollowupType(question) ?? "clinic_review",
    preferredDate: inferPreferredDate(question),
    note: "",
  };
}

function mergeFollowupPayload(
  question: string,
  payload?: FollowupServiceRequest,
): FollowupServiceRequest {
  const inferred = inferFollowupPayload(question);
  return {
    kind: "followup",
    followupType: payload?.followupType ?? inferred.followupType,
    preferredDate: payload?.preferredDate?.trim() || inferred.preferredDate,
    note: payload?.note?.trim() || inferred.note,
  };
}

function lookupRefillRule(payload?: RefillServiceRequest) {
  return {
    renewableLabel: "由医生按既往处方和现行目录确认",
    stockLabel: "由药师或药房核对实时库存",
    reviewLabel: "由医生结合近期记录判断是否需要复诊",
    disease: payload?.disease ?? "慢病",
  };
}

function buildScheduleResult(question: string): AgentResult {
  const preferredDate = inferPreferredDate(question);
  const preferredTime = inferPreferredTime(question);

  return {
    matched: true,
    intent: "doctor_schedule_query",
    label: "医生排班查询",
    summary:
      "Claw 已把您的问题整理成排班查询，具体医生与时段只读取机构已核验数据。",
    needsHumanReview: false,
    cards: [
      createCard({
        intent: "doctor_schedule_query",
        title: "查看今日及近期排班",
        summary:
          "先查看机构核验过的坐班医生、科室和服务时间，再决定走官方入口或请家医团队协助。",
        status: "ready",
        urgency: "routine",
        eta: "约 1 分钟完成初步确认",
        serviceWindow: "如果是替家属预约，建议同时准备就诊人信息和可到诊时间。",
        recommendedTeam: "家庭医生 / 导诊台",
        preparedMaterials: [
          "目标症状或疾病方向",
          "希望就诊日期",
          "就诊人姓名与证件信息",
        ],
        serviceFacts: [
          {
            label: "排班来源",
            value: "仅展示机构已核验排班",
            tone: "positive",
          },
          {
            label: "期望时段",
            value: `${preferredDate}${preferredTime}`,
            tone: "neutral",
          },
          {
            label: "号源状态",
            value: "以官方入口或家医团队回写为准",
            tone: "warning",
          },
        ],
        actions: [
          { label: "查看已核验排班", href: "/services", kind: "primary" },
          {
            label: "请家医协助",
            href: "/appointments?type=clinic_registration",
            kind: "secondary",
          },
        ],
        steps: createSteps(0, [
          { title: "确认想看的问题方向", owner: "居民", ownerRole: "resident" },
          { title: "查看已核验排班与官方入口", owner: "Claw" },
          { title: "决定是否继续挂号", owner: "居民", ownerRole: "resident" },
        ]),
      }),
    ],
  };
}

function buildRegistrationResult(
  question: string,
  payload?: RegistrationServiceRequest,
): AgentResult {
  const request = mergeRegistrationPayload(question, payload);
  const preferredDate = request.preferredDate ?? "明天";
  const preferredTime = request.preferredTime ?? "下午";
  const preferredDoctor = request.preferredDoctor?.trim();

  return {
    matched: true,
    intent: "clinic_registration",
    label: "挂号协助",
    summary:
      "Claw 已把您的诉求整理成挂号协助流程，方便继续确认号源并安排就诊。",
    needsHumanReview: true,
    cards: [
      createCard({
        intent: "clinic_registration",
        title: "帮您发起挂号任务",
        summary: `已识别到您想预约就诊，优先目标是 ${request.department || request.symptom || "相关门诊"}，倾向 ${preferredDate}${preferredTime}${preferredDoctor ? `，优先考虑 ${preferredDoctor}` : ""}。`,
        status: "queued",
        urgency: "soon",
        eta: "通常当天可完成初步回写",
        serviceWindow: "优先确认目标科室、时段、是否接受候补或替代医生。",
        recommendedTeam: "家庭医生 / 门诊导诊 / 社区前台",
        preparedMaterials: [
          "就诊人姓名",
          "医保卡或身份证",
          "希望预约的时段",
          "是否接受候补号源",
        ],
        serviceFacts: [
          {
            label: "预约目标",
            value:
              request.department || request.symptom || "已生成门诊挂号协助",
            tone: "positive",
          },
          {
            label: "期望时段",
            value: `${preferredDate}${preferredTime}`,
            tone: "neutral",
          },
          ...(preferredDoctor
            ? [
                {
                  label: "优先医生",
                  value: preferredDoctor,
                  tone: "positive" as const,
                },
              ]
            : []),
          {
            label: "医生与科室",
            value: "按已核验排班和家医评估确认",
            tone: "neutral",
          },
          {
            label: "号源确认",
            value: "待官方入口或团队回写结果",
            tone: "warning",
          },
        ],
        actions: [
          {
            label: "确认并填写申请",
            href: "/appointments?type=clinic_registration",
            kind: "primary",
          },
          { label: "查看服务进度", href: "/appointments", kind: "secondary" },
        ],
        steps: createSteps(1, [
          { title: "居民提出挂号需求", owner: "居民", ownerRole: "resident" },
          {
            title: "家医团队确认号源和候选医生",
            owner: "家庭医生 / 导诊",
            ownerRole: "community",
          },
          {
            title: "回写预约结果",
            owner: "团队 / Claw",
            ownerRole: "community",
          },
        ]),
      }),
    ],
  };
}

function buildReferralResult(question: string, request: ReferralServiceRequest): AgentResult {
  const preferredDate = request.preferredDate || inferPreferredDate(question);
  const preferredTime = request.preferredTime || inferPreferredTime(question);
  const destination = [request.institution, request.department].filter(Boolean).join(" · ") || "待家医团队评估的上级机构与科室";
  return {
    matched: true,
    intent: "referral_assistance",
    label: "分级转诊协助",
    summary: "Claw 已把诉求整理成分级转诊协助，先由所属家医团队核对情况和协作路径。",
    needsHumanReview: true,
    cards: [
      createCard({
        intent: "referral_assistance",
        title: "请家医团队评估转诊路径",
        summary: `居民希望转诊至 ${destination}，倾向 ${preferredDate}${preferredTime}。目标机构、科室和可用资源均需团队核验。`,
        status: "queued",
        urgency: "soon",
        eta: "通常 2 个工作日内完成初步反馈",
        serviceWindow: "家医团队会先判断社区能否处理，再按协作网络联系上级机构。",
        recommendedTeam: "家庭医生 / 社区转诊协调人员",
        preparedMaterials: ["既往就诊资料", "检查或出院记录", "医保卡或身份证", "可联系时间"],
        serviceFacts: [
          { label: "居民意向", value: destination, tone: "positive" },
          { label: "办理方式", value: "社区评估后人工协调", tone: "neutral" },
          { label: "号源与接诊", value: "以合作机构和团队回写为准", tone: "warning" },
        ],
        actions: [
          { label: "核对并申请转诊协助", href: "/appointments?type=referral_assistance", kind: "primary" },
          { label: "查看分级诊疗网络", href: "/services", kind: "secondary" },
        ],
        steps: createSteps(1, [
          { title: "居民提出转诊诉求", owner: "居民", ownerRole: "resident" },
          { title: "社区评估并核对协作路径", owner: "家庭医生", ownerRole: "doctor" },
          { title: "联系上级机构并回写结果", owner: "转诊协调人员", ownerRole: "community" },
        ]),
      }),
    ],
  };
}

export function inferServiceRequestFromQuestion(
  question: string,
): ServiceRequestPayload | null {
  const normalized = question.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const asksAboutCapabilities = /(?:能|可以).{0,6}帮我.{0,8}(?:做什么|什么|哪些)/.test(normalized);
  const actionCue = hasActionCue(normalized) && !asksAboutCapabilities;
  const lookupOnly = isInformationLookup(normalized) && !actionCue;

  const hasRegistration = includesAny(normalized, [
    "挂号",
    "预约",
    "约号",
    "约医生",
    "帮我约",
  ]);
  const hasFamilyDoctor = includesAny(normalized, [
    "家医",
    "家庭医生",
    "签约医生",
    "上门",
  ]);
  const hasRefill = includesAny(normalized, [
    "续方",
    "续药",
    "配药",
    "拿药",
    "药快吃完",
    "药吃完",
    "开一下药",
  ]);
  const hasDispenseStatus = includesAny(normalized, [
    "药配好了吗",
    "配好了吗",
    "可以取药了吗",
    "寄出了吗",
    "配送到哪了",
  ]);
  const hasFollowup = includesAny(normalized, [
    "复诊",
    "复查",
    "随访",
    "回访",
    "提醒我",
  ]);
  const hasReferral = includesAny(normalized, [
    "转诊",
    "上转",
    "转院",
    "转到医院",
    "转去医院",
  ]);

  if (lookupOnly && !hasDispenseStatus) {
    return null;
  }

  if (hasReferral && actionCue) {
    return {
      kind: "referral",
      target: question.trim(),
      institution: inferReferralInstitution(question),
      department: inferRegistrationDepartment(question),
      preferredDate: inferPreferredDate(question),
      preferredTime: inferPreferredTime(question),
    };
  }

  if (hasRegistration && !hasFamilyDoctor && actionCue) {
    return mergeRegistrationPayload(question);
  }

  if (hasFamilyDoctor && actionCue) {
    return mergeFamilyDoctorPayload(question);
  }

  if (hasDispenseStatus) {
    return mergeDispenseStatusPayload(question);
  }

  if (hasRefill && actionCue) {
    return mergeRefillPayload(question);
  }

  if (hasFollowup && actionCue) {
    return mergeFollowupPayload(question);
  }

  return null;
}

function buildFamilyDoctorBookingResult(
  question: string,
  payload?: FamilyDoctorServiceRequest,
): AgentResult {
  const request = mergeFamilyDoctorPayload(question, payload);
  const preferredDate = request.preferredDate ?? "明天";
  const preferredTime = request.preferredTime ?? "下午";
  const serviceModeLabel =
    request.serviceMode === "clinic"
      ? "线下面诊"
      : request.serviceMode === "phone"
        ? "电话回访"
        : request.serviceMode === "home_visit"
          ? "上门服务"
          : "面诊、电话或上门均可";
  const note = request.note?.trim();

  return {
    matched: true,
    intent: "family_doctor_booking",
    label: "家医服务预约",
    summary:
      "Claw 已将您的问题识别为家医预约任务，适合转给家庭医生团队继续安排。",
    needsHumanReview: true,
    cards: [
      createCard({
        intent: "family_doctor_booking",
        title: "安排家庭医生服务时段",
        summary: note
          ? `已记录您希望在${preferredDate}${preferredTime}安排${serviceModeLabel}，补充说明为“${note}”。`
          : `已记录您希望在${preferredDate}${preferredTime}安排${serviceModeLabel}。`,
        status: "queued",
        urgency: "soon",
        eta: "通常 1 个工作日内跟进",
        serviceWindow: "如果需要上门或电话回访，建议补充可联系时间。",
        recommendedTeam: "家庭医生团队",
        preparedMaterials: [
          "居民姓名",
          "联系电话",
          "希望预约时间",
          "本次要处理的主要问题",
        ],
        serviceFacts: [
          { label: "预约类型", value: serviceModeLabel, tone: "positive" },
          {
            label: "期望时段",
            value: `${preferredDate}${preferredTime}`,
            tone: "neutral",
          },
          {
            label: "联系窗口",
            value: "待家医团队进一步确认时间",
            tone: "neutral",
          },
        ],
        actions: [
          {
            label: "填写家医预约",
            href: "/appointments?type=family_doctor_booking",
            kind: "primary",
          },
          {
            label: "查看服务进度",
            href: "/appointments",
            kind: "secondary",
          },
        ],
        steps: createSteps(1, [
          { title: "提交预约诉求", owner: "居民", ownerRole: "resident" },
          { title: "家医团队确认时间", owner: "家庭医生", ownerRole: "doctor" },
          {
            title: "完成提醒或改约",
            owner: "Claw / 家属",
            ownerRole: "doctor",
          },
        ]),
      }),
    ],
  };
}

function buildRefillResult(payload?: RefillServiceRequest): AgentResult {
  const request = mergeRefillPayload(
    `${payload?.medicineName ?? ""} ${payload?.disease ?? ""} ${payload?.stockLeft ?? ""}`,
    payload,
  );
  const refillRule = lookupRefillRule(request);
  const disease = refillRule.disease;
  const medicineName = request.medicineName || "上次那个药";
  const stockLeft = request.stockLeft || "药快吃完了";
  const deliveryLabel =
    request.deliveryMethod === "pickup"
      ? "偏向到店自取"
      : request.deliveryMethod === "mail"
        ? "偏向邮寄到家"
        : "自取或邮寄都可以";

  return {
    matched: true,
    intent: "refill_request",
    label: "续方配药",
    summary:
      "Claw 已把您的问题整理成续方配药流程，后续会交给医生、药师和药房继续协同。",
    needsHumanReview: true,
    cards: [
      createCard({
        intent: "refill_request",
        title: "生成续方 / 配药申请",
        summary: `本次申请聚焦 ${disease} 用药 ${medicineName}，当前状态是“${stockLeft}”。`,
        status: "queued",
        urgency: "priority",
        eta: "建议当天发起，避免断药",
        serviceWindow: "续方前会先核对既往处方、库存、是否需要线下复诊。",
        recommendedTeam: "家庭医生 / 药师 / 药房窗口",
        preparedMaterials: [
          "上次处方或药盒照片",
          "当前剩余药量",
          "近期血压/血糖等记录",
          "选择自取还是邮寄",
        ],
        serviceFacts: [
          { label: "目标药品", value: medicineName, tone: "positive" },
          { label: "慢病类型", value: disease, tone: "neutral" },
          {
            label: "可续方目录",
            value: refillRule.renewableLabel,
            tone: "neutral",
          },
          { label: "药房库存", value: refillRule.stockLabel, tone: "neutral" },
          { label: "剩余药量", value: stockLeft, tone: "warning" },
          { label: "交付方式", value: deliveryLabel, tone: "neutral" },
          {
            label: "是否需线下复诊",
            value: refillRule.reviewLabel,
            tone: "warning",
          },
        ],
        actions: [
          {
            label: "填写续方申请",
            href: "/appointments?type=refill_request",
            kind: "primary",
          },
          {
            label: "查看服务进度",
            href: "/appointments",
            kind: "secondary",
          },
        ],
        steps: createSteps(1, [
          { title: "提交续方申请", owner: "居民", ownerRole: "resident" },
          {
            title: "医生审核是否可续方",
            owner: "家庭医生",
            ownerRole: "doctor",
          },
          {
            title: "药师审方并通知配药结果",
            owner: "药师 / 药房",
            ownerRole: "pharmacist",
          },
        ]),
      }),
    ],
  };
}

function buildFollowupResult(
  question: string,
  payload?: FollowupServiceRequest,
): AgentResult {
  const request = mergeFollowupPayload(question, payload);
  const followupTypeLabel =
    request.followupType === "phone_followup"
      ? "电话随访"
      : request.followupType === "checkup"
        ? "复查提醒"
        : request.followupType === "medication_reminder"
          ? "用药提醒"
          : "复诊提醒";
  const preferredDate = request.preferredDate ?? "本周";
  const note = request.note?.trim();

  return {
    matched: true,
    intent: "followup_reminder",
    label: "随访提醒",
    summary:
      "Claw 已把您的问题整理成随访提醒任务，下一步可以确认时间并继续跟踪状态。",
    needsHumanReview: true,
    cards: [
      createCard({
        intent: "followup_reminder",
        title: "安排随访提醒",
        summary: note
          ? `已记录${followupTypeLabel}需求，期望安排在${preferredDate}，并附带说明“${note}”。`
          : `已记录${followupTypeLabel}需求，期望安排在${preferredDate}。`,
        status: "in_progress",
        urgency: "soon",
        eta: "通常本周内可确认",
        serviceWindow: "可结合家属提醒和服务进度一起跟踪。",
        recommendedTeam: "护士 / 家庭医生 / 家属协同",
        preparedMaterials: [
          "上次随访日期",
          "最近检查结果",
          "本周可接听电话或到诊时间",
        ],
        serviceFacts: [
          { label: "提醒类型", value: followupTypeLabel, tone: "positive" },
          { label: "期望时间", value: preferredDate, tone: "neutral" },
          {
            label: "下一动作",
            value: "待团队确认提醒时间和方式",
            tone: "neutral",
          },
        ],
        actions: [
          {
            label: "确认随访需求",
            href: "/appointments?type=followup_reminder",
            kind: "primary",
          },
          {
            label: "查看服务进度",
            href: "/appointments",
            kind: "secondary",
          },
        ],
        steps: createSteps(1, [
          { title: "确认随访需求", owner: "居民", ownerRole: "resident" },
          {
            title: "团队安排提醒时间",
            owner: "护士 / 家庭医生",
            ownerRole: "nurse",
          },
          {
            title: "完成随访并回写状态",
            owner: "团队 / Claw",
            ownerRole: "nurse",
          },
        ]),
      }),
    ],
  };
}

function buildDispenseStatusResult(
  question: string,
  payload?: DispenseStatusServiceRequest,
): AgentResult {
  const request = mergeDispenseStatusPayload(question, payload);
  const deliveryLabel =
    request.deliveryMethod === "pickup"
      ? "到店自取"
      : request.deliveryMethod === "mail"
        ? "邮寄到家"
        : "自取或邮寄都可以";
  const progressFocusLabel =
    request.progressFocus === "review"
      ? "医生/药师审核"
      : request.progressFocus === "dispense"
        ? "药房配药"
        : request.progressFocus === "delivery"
          ? "配送或自取"
          : "整体进度";
  const medicineName = request.medicineName?.trim();

  return {
    matched: true,
    intent: "dispense_status_query",
    label: "配药进度查询",
    summary:
      "Claw 已把您的问题识别成配药进度查询，重点是查看当前停留在哪个处理节点。",
    needsHumanReview: false,
    cards: [
      createCard({
        intent: "dispense_status_query",
        title: "查看药品是否已配好",
        summary: medicineName
          ? `正在帮您跟进 ${medicineName} 的${progressFocusLabel}，当前交付方式偏向${deliveryLabel}。`
          : `正在帮您跟进配药${progressFocusLabel}，当前交付方式偏向${deliveryLabel}。`,
        status: "in_progress",
        urgency: "routine",
        eta: "建议先看服务进度中的当前节点",
        serviceWindow: "如果停留在药师或药房节点较久，可再联系团队催办。",
        recommendedTeam: "药师 / 药房窗口",
        preparedMaterials: ["申请时间", "药品名称", "自取还是邮寄"],
        serviceFacts: [
          { label: "查询类型", value: progressFocusLabel, tone: "positive" },
          { label: "交付方式", value: deliveryLabel, tone: "neutral" },
          ...(medicineName
            ? [
                {
                  label: "药品名称",
                  value: medicineName,
                  tone: "neutral" as const,
                },
              ]
            : []),
          {
            label: "下一动作",
            value: "待药师或药房同步当前状态",
            tone: "neutral",
          },
        ],
        actions: [
          { label: "查看服务进度", href: "/appointments", kind: "primary" },
          { label: "查看服务方式", href: "/services", kind: "secondary" },
        ],
        steps: createSteps(1, [
          { title: "提交配药申请", owner: "居民", ownerRole: "resident" },
          {
            title: "查看当前处理节点",
            owner: "居民 / Claw",
            ownerRole: "resident",
          },
          {
            title: "确认自取或邮寄安排",
            owner: "药房 / 家属",
            ownerRole: "pharmacist",
          },
        ]),
      }),
    ],
  };
}

export function detectAgentResult(
  question: string,
  serviceRequest?: ServiceRequestPayload | null,
): AgentResult | null {
  if (serviceRequest?.kind === "registration") {
    return buildRegistrationResult(question, serviceRequest);
  }

  if (serviceRequest?.kind === "refill") {
    return buildRefillResult(serviceRequest);
  }

  if (serviceRequest?.kind === "family_doctor") {
    return buildFamilyDoctorBookingResult(question, serviceRequest);
  }

  if (serviceRequest?.kind === "dispense_status") {
    return buildDispenseStatusResult(question, serviceRequest);
  }

  if (serviceRequest?.kind === "followup") {
    return buildFollowupResult(question, serviceRequest);
  }

  if (serviceRequest?.kind === "referral") {
    return buildReferralResult(question, serviceRequest);
  }

  if (serviceRequest?.kind === "community_activity") {
    return null;
  }

  const normalized = question.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const hasSchedule = includesAny(normalized, [
    "排班",
    "坐班",
    "出诊",
    "门诊",
    "今天谁能看",
    "下午还有号吗",
  ]);
  const hasRegistration = includesAny(normalized, [
    "挂号",
    "预约",
    "约号",
    "约医生",
    "帮我约",
  ]);
  const hasFamilyDoctor = includesAny(normalized, [
    "家医",
    "家庭医生",
    "签约医生",
    "签约服务",
    "上门",
  ]);
  const hasRefill = includesAny(normalized, [
    "续方",
    "续药",
    "配药",
    "拿药",
    "药快吃完",
    "药吃完",
    "开药",
  ]);
  const hasDispenseStatus = includesAny(normalized, [
    "药配好了吗",
    "配好了吗",
    "能取药了吗",
    "寄出了吗",
  ]);
  const hasFollowup = includesAny(normalized, [
    "随访",
    "复查",
    "复诊",
    "回访",
    "提醒我",
  ]);
  const actionCue = hasActionCue(normalized);
  const lookupOnly = isInformationLookup(normalized) && !actionCue;

  if (lookupOnly && !hasDispenseStatus) {
    return null;
  }

  if (hasRegistration && hasFamilyDoctor && actionCue) {
    return buildFamilyDoctorBookingResult(question);
  }

  if (hasRegistration && actionCue) {
    return buildRegistrationResult(question);
  }

  if (hasSchedule && !lookupOnly) {
    return buildScheduleResult(question);
  }

  if (hasDispenseStatus) {
    return buildDispenseStatusResult(question);
  }

  if (hasRefill && actionCue) {
    return buildRefillResult();
  }

  if (hasFollowup && actionCue) {
    return buildFollowupResult(question);
  }

  return null;
}

function getRiskLevel(intent: AgentIntent): RiskLevel {
  if (intent === "refill_request") {
    return "medium";
  }

  if (intent === "clinic_registration" || intent === "family_doctor_booking") {
    return "medium";
  }

  if (intent === "referral_assistance") return "medium";

  return "low";
}

export function buildAgentReply(
  question: string,
  serviceRequest?: ServiceRequestPayload | null,
): AskReply | null {
  const agentResult = detectAgentResult(question, serviceRequest);

  if (!agentResult) {
    return null;
  }

  const answerMap: Record<AgentIntent, string> = {
    doctor_schedule_query:
      "我先把您的问题整理成排班查询服务，下面直接给您看可约的门诊和时段。",
    clinic_registration:
      "我已把您的诉求整理成挂号协助任务，接下来可以继续确认号源并推进预约。",
    family_doctor_booking:
      "我已把您的问题整理成家庭医生预约任务，适合继续转给家庭医生团队安排。",
    referral_assistance:
      "我已把您的诉求整理成分级转诊协助，先由所属家医团队评估，再按协作网络核对上级机构和科室。",
    refill_request:
      "我已把您的问题整理成续方配药申请，后续重点是核对既往处方、库存和近期记录，避免断药。",
    dispense_status_query:
      "我已把您的问题整理成配药进度查询，您可以先查看服务进度里的当前处理节点。",
    followup_reminder:
      "我已把您的问题整理成随访提醒任务，接下来可以确认时间并继续跟踪服务状态。",
  };

  return {
    answer: answerMap[agentResult.intent],
    nextStep: "您可以直接查看下方任务卡，按步骤继续处理。",
    suggestDoctor: agentResult.needsHumanReview,
    riskLevel: getRiskLevel(agentResult.intent),
    category: "Agent 服务编排",
    source: "agent",
    agentResult,
  };
}

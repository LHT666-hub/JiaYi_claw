import { AppRole } from "@/lib/types";

export type RecommendedRole = Extract<AppRole, "doctor" | "nurse" | "pharmacist" | "community" | "family">;

export type RoleRecommendation = {
  role: RecommendedRole;
  roleLabel: string;
  displayLabel: string;
  reason: string;
};

const roleLabelMap: Record<RecommendedRole, string> = {
  pharmacist: "药师",
  nurse: "护士",
  community: "居委/楼组长",
  doctor: "家庭医生",
  family: "家属",
};

const roleDisplayLabelMap: Record<RecommendedRole, string> = {
  pharmacist: "陈药师",
  nurse: "王护士",
  community: "居委张老师",
  doctor: "李医生",
  family: "家属",
};

const roleRules: Array<{ keywords: string[]; role: RecommendedRole; reason: string }> = [
  {
    keywords: ["配药", "药品目录", "长处方", "延伸处方", "药盒", "续方", "拿药", "开药", "药没了", "药吃完"],
    role: "pharmacist",
    reason: "该问题主要涉及配药规则、药品目录或用药说明，可先由药师协助解释；如涉及调药或病情判断，再转家庭医生。",
  },
  {
    keywords: ["血压", "血糖", "随访", "健康记录", "打卡", "健康任务", "量血压", "测血糖", "健康提醒", "记录"],
    role: "nurse",
    reason: "该问题主要涉及随访提醒、健康记录和日常管理，可先由团队护士协助。",
  },
  {
    keywords: ["健康云", "小程序", "预约体检", "不会操作", "社区通知", "登记", "公众号", "登录", "操作"],
    role: "community",
    reason: "该问题主要涉及操作协助、通知和登记，可由居委或楼组长先协助。",
  },
  {
    keywords: ["不会用", "手机", "看不懂", "帮我操作", "帮我弄", "不知道怎么", "帮忙", "子女"],
    role: "family",
    reason: "涉及操作协助或生活照护，建议家属介入帮忙",
  },
  {
    keywords: ["报告", "转诊", "专家号", "停药", "换药", "药量", "严重", "异常", "诊断", "住院", "治疗"],
    role: "doctor",
    reason: "该问题涉及专业医疗判断或风险识别，需要家庭医生进一步判断。",
  },
];

export function getRecommendedRole(question: string): RoleRecommendation {
  const normalized = question.toLowerCase();

  for (const rule of roleRules) {
    if (rule.keywords.some((kw) => normalized.includes(kw))) {
      return {
        role: rule.role,
        roleLabel: roleLabelMap[rule.role],
        displayLabel: roleDisplayLabelMap[rule.role],
        reason: rule.reason,
      };
    }
  }

  return {
    role: "doctor",
    roleLabel: roleLabelMap.doctor,
    displayLabel: roleDisplayLabelMap.doctor,
    reason: "该问题类型暂不明确，建议由家庭医生团队先判断后再分派。",
  };
}

type PrepareCategory = "report" | "medicine" | "followup" | "healthcloud" | "general";

function inferPrepareCategory(question: string): PrepareCategory {
  const q = question.toLowerCase();

  if (q.includes("报告") || q.includes("体检") || q.includes("检查") || q.includes("化验")) {
    return "report";
  }
  if (q.includes("药") || q.includes("处方") || q.includes("配药") || q.includes("用药")) {
    return "medicine";
  }
  if (q.includes("随访") || q.includes("血压") || q.includes("血糖") || q.includes("复查")) {
    return "followup";
  }
  if (q.includes("健康云") || q.includes("小程序") || q.includes("预约") || q.includes("操作")) {
    return "healthcloud";
  }
  return "general";
}

const prepareMaterialsByCategory: Record<PrepareCategory, string[]> = {
  report: [
    "体检报告或检查单原件",
    "近期用药清单",
    "上次就诊的病历摘要（如有）",
  ],
  medicine: [
    "药盒或处方单（拍照即可）",
    "当前剩余药量",
    "近期是否有漏服或自行调整剂量",
  ],
  followup: [
    "近一周血压/血糖记录",
    "当前用药清单",
    "近期身体不适的简要描述",
  ],
  healthcloud: [
    "手机截图（操作到哪一步卡住了）",
    "身份证号或医保卡号（供家属协助）",
    "需要预约的科室或项目名称",
  ],
  general: [
    "近期用药清单或体检报告",
    "问题发生的大概时间和经过",
  ],
};

export type ClawSummary = {
  residentQuestion: string;
  clawResponse: string;
  whySuggestDoctor: string;
  prepareItems: string[];
  prepareCategory: PrepareCategory;
  recommendedRole: RoleRecommendation;
  doctorSummary: string;
  fullText: string;
};

function buildDoctorSummary(
  question: string,
  reply: { answer: string; nextStep: string; riskLevel: string; suggestDoctor: boolean },
  roleRec: RoleRecommendation,
): string {
  const riskLabel =
    reply.riskLevel === "emergency"
      ? "紧急"
      : reply.riskLevel === "high"
        ? "高风险"
        : reply.riskLevel === "medium"
          ? "需关注"
          : "常规";

  return `居民问了「${question}」，Claw 已做初步回答但该问题${reply.suggestDoctor ? "建议家医团队介入" : "超出 Claw 能力范围"}。风险等级：${riskLabel}。建议由${roleRec.displayLabel}跟进处理。`;
}

export function generateClawSummary(
  question: string,
  reply: { answer: string; nextStep: string; riskLevel: string; suggestDoctor: boolean },
): ClawSummary {
  const clawResponse = `${reply.answer} ${reply.nextStep}`.trim();

  let whySuggestDoctor: string;
  if (reply.riskLevel === "emergency") {
    whySuggestDoctor = "居民描述可能涉及紧急状况，需家医团队尽快关注。";
  } else if (reply.riskLevel === "high") {
    whySuggestDoctor = "问题涉及医疗安全边界（停药/换药/诊断等），Claw 无法给出建议，需医生判断。";
  } else if (reply.suggestDoctor) {
    whySuggestDoctor = "Claw 已给出流程回答，但该问题仍建议家医团队介入确认。";
  } else {
    whySuggestDoctor = "该问题超出 Claw 能力范围，建议家医团队进一步跟进。";
  }

  const prepareCategory = inferPrepareCategory(question);
  const prepareItems = prepareMaterialsByCategory[prepareCategory];
  const roleRec = getRecommendedRole(question);
  const doctorSummary = buildDoctorSummary(question, reply, roleRec);

  const fullText = [
    `【居民原始问题】`,
    question,
    ``,
    `【Claw 已给出的回答】`,
    clawResponse,
    ``,
    `【建议联系家医的原因】`,
    whySuggestDoctor,
    ``,
    `【建议准备的材料】`,
    ...prepareItems.map((item) => `• ${item}`),
    ``,
    `【建议处理角色】`,
    `${roleRec.displayLabel}（${roleRec.roleLabel}）：${roleRec.reason}`,
    ``,
    `【给医生的简要说明】`,
    doctorSummary,
  ].join("\n");

  return {
    residentQuestion: question,
    clawResponse,
    whySuggestDoctor,
    prepareItems,
    prepareCategory,
    recommendedRole: roleRec,
    doctorSummary,
    fullText,
  };
}

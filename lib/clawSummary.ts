import { AskReply, AppRole } from "@/lib/types";

export type RecommendedRole = Extract<AppRole, "doctor" | "nurse" | "pharmacist" | "community">;

export type RoleRecommendation = {
  role: RecommendedRole;
  roleLabel: string;
  reason: string;
};

const roleLabelMap: Record<RecommendedRole, string> = {
  pharmacist: "药师",
  nurse: "护士",
  community: "居委/楼组长",
  doctor: "家庭医生",
};

const roleRules: Array<{ keywords: string[]; role: RecommendedRole; reason: string }> = [
  {
    keywords: ["配药", "药品目录", "长处方", "延伸处方", "拿药", "开药", "药没了", "药吃完"],
    role: "pharmacist",
    reason: "涉及配药流程或处方规则，建议药师处理",
  },
  {
    keywords: ["随访", "血压", "血糖", "记录", "健康提醒", "打卡", "量血压", "测血糖"],
    role: "nurse",
    reason: "涉及随访安排或健康记录管理，建议护士处理",
  },
  {
    keywords: ["健康云", "体检预约", "不会用", "手机", "社区通知", "公众号", "操作", "登录"],
    role: "community",
    reason: "涉及平台操作或社区通知，建议居委/楼组长协助",
  },
  {
    keywords: ["报告", "转诊", "停药", "换药", "严重", "异常", "诊断", "住院", "治疗"],
    role: "doctor",
    reason: "涉及报告解释、转诊或用药调整，需家庭医生判断",
  },
];

export function getRecommendedRole(question: string): RoleRecommendation {
  const normalized = question.toLowerCase();

  for (const rule of roleRules) {
    if (rule.keywords.some((kw) => normalized.includes(kw))) {
      return {
        role: rule.role,
        roleLabel: roleLabelMap[rule.role],
        reason: rule.reason,
      };
    }
  }

  return {
    role: "doctor",
    roleLabel: roleLabelMap.doctor,
    reason: "无法确定具体类型，默认建议家庭医生关注",
  };
}

function inferPrepareItems(question: string): string[] {
  const items: string[] = [];
  const q = question.toLowerCase();

  if (q.includes("药") || q.includes("处方") || q.includes("配药")) {
    items.push("药盒或处方单");
  }
  if (q.includes("报告") || q.includes("体检") || q.includes("检查")) {
    items.push("体检报告或检查单");
  }
  if (q.includes("血压") || q.includes("血糖")) {
    items.push("近期血压/血糖记录");
  }
  if (q.includes("转诊") || q.includes("专家")) {
    items.push("既往病历或转诊单");
  }

  if (items.length === 0) {
    items.push("近期用药清单或体检报告");
  }

  return items;
}

export type ClawSummary = {
  residentQuestion: string;
  clawResponse: string;
  whySuggestDoctor: string;
  prepareItems: string[];
  fullText: string;
};

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

  const prepareItems = inferPrepareItems(question);

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
    `【建议居民准备的信息】`,
    ...prepareItems.map((item) => `• ${item}`),
  ].join("\n");

  return {
    residentQuestion: question,
    clawResponse,
    whySuggestDoctor,
    prepareItems,
    fullText,
  };
}

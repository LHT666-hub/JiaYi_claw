import { faqs } from "@/data/faqs";
import { AskFallbackReason, AskReply, FaqItem } from "@/lib/types";

export const emergencyKeywords = [
  "胸痛",
  "呼吸困难",
  "意识异常",
  "意识不清",
  "昏迷",
  "抽搐",
  "严重低血糖",
  "肢体无力",
  "言语不清",
  "口角歪斜",
  "剧烈胸闷",
];

export const medicalBoundaryKeywords = [
  "停药",
  "换药",
  "药量",
  "剂量",
  "加药",
  "减药",
  "能不能不吃药",
  "报告严不严重",
  "是不是得了",
  "要不要住院",
  "诊断",
  "处方",
  "治疗方案",
];

const kimiScopeKeywords = [
  "家庭医生",
  "家医",
  "签约",
  "体检",
  "报告",
  "配药",
  "开药",
  "药",
  "长处方",
  "延伸处方",
  "随访",
  "转诊",
  "血压",
  "血糖",
  "高血压",
  "糖尿病",
  "慢病",
  "用药",
  "小课堂",
  "积分",
  "打卡",
  "小组",
  "群聊",
  "社区卫生",
  "卫生服务",
  "社区",
  "保健品",
  "居委",
  "护士",
  "药师",
  "医生",
  "家属",
];

const emergencyReply: AskReply = {
  answer:
    "如出现胸痛、呼吸困难、意识异常、严重低血糖、肢体无力、言语不清等情况，请立即就医或拨打急救电话。家医 Claw 不能替代急诊判断。",
  nextStep: "不要在线上等待回复，请尽快寻求线下急救帮助。",
  suggestDoctor: true,
  riskLevel: "emergency",
  category: "安全边界和紧急情况",
  source: "safety",
};

const medicalBoundaryReply: AskReply = {
  answer:
    "这个问题需要家庭医生或线下医生结合个人情况判断。家医 Claw 不能提供诊断、处方、停药、换药或个体化治疗建议。建议联系家庭医生或前往社区卫生服务中心/医院咨询。",
  nextStep: "如果是流程、配药规则、随访安排或签约服务问题，我可以继续帮您整理下一步。",
  suggestDoctor: true,
  riskLevel: "high",
  category: "安全边界和紧急情况",
  source: "safety",
};

const fallbackReply: AskReply = {
  answer:
    "这个问题我暂时还不能确定。建议联系家庭医生或社区卫生服务中心进一步咨询。",
  nextStep: "您也可以换一种更具体的说法，例如“药吃完了怎么办”或“怎么联系家庭医生”。",
  suggestDoctor: true,
  riskLevel: "medium",
  category: "兜底提示",
  source: "fallback",
};

const busyReply: AskReply = {
  answer:
    "当前智能问答访问人数较多，请稍后再试。您也可以先查看常见问题，或联系家庭医生。",
  nextStep: "可以稍后再问，或先尝试常见问题入口。",
  suggestDoctor: false,
  riskLevel: "low",
  category: "访问繁忙",
  source: "fallback",
};

const emptyReply: AskReply = {
  answer: "您可以直接说出问题，例如：药吃完了怎么办？",
  nextStep: "也可以试试首页里的快捷问题。",
  suggestDoctor: false,
  riskLevel: "low",
  category: "引导",
  source: "fallback",
};

const normalizationMap: Array<[string, string]> = [
  ["健康云平台", "健康云"],
  ["小程序", "平台"],
  ["咋", "怎么"],
  ["如何", "怎么"],
  ["登陆", "登录"],
  ["拿药", "配药"],
  ["开药", "配药"],
  ["药没了", "药吃完了"],
  ["检查结果", "体检报告"],
];

const coreTokens = [
  "健康云",
  "登录",
  "预约",
  "体检",
  "平台",
  "家庭医生",
  "家医",
  "找医生",
  "配药",
  "服药",
  "积分",
  "小课堂",
  "群聊",
  "老人",
  "手机",
  "不会用",
];

const weakKeywords = new Set([
  "社区",
  "医生",
  "药",
  "报告",
  "体检",
  "平台",
  "怎么",
  "随访",
]);

export function normalizeQuestion(question: string) {
  let normalized = question.trim().toLowerCase().replace(/\s+/g, "");

  for (const [from, to] of normalizationMap) {
    normalized = normalized.replaceAll(from, to);
  }

  return normalized;
}

function scoreCoreTokens(textA: string, textB: string) {
  return coreTokens.reduce((total, token) => {
    if (textA.includes(token) && textB.includes(token)) {
      return total + 4;
    }

    return total;
  }, 0);
}

function scoreFaqItem(item: FaqItem, normalized: string) {
  const itemQuestion = normalizeQuestion(item.question);
  let directKeywordHit = false;
  let strongQuestionHit = false;

  const keywordScore = item.keywords.reduce((total, keyword) => {
    const normalizedKeyword = normalizeQuestion(keyword);

    if (!normalizedKeyword) {
      return total;
    }

    if (normalized.includes(normalizedKeyword)) {
      if (normalizedKeyword.length >= 3 && !weakKeywords.has(normalizedKeyword)) {
        directKeywordHit = true;
      }
      return total + Math.max(30, normalizedKeyword.length + 16);
    }

    if (normalizedKeyword.includes(normalized)) {
      return total + Math.max(10, normalized.length + 6);
    }

    return total + scoreCoreTokens(normalized, normalizedKeyword);
  }, 0);

  const questionScore =
    (normalized === itemQuestion ? 18 : 0) +
    (normalized.includes(itemQuestion) || itemQuestion.includes(normalized)
      ? ((strongQuestionHit = true), 8)
      : 0) +
    scoreCoreTokens(normalized, itemQuestion);

  return {
    score: keywordScore + questionScore,
    directKeywordHit,
    strongQuestionHit,
  };
}

export function matchFaq(question: string) {
  const normalized = normalizeQuestion(question);

  if (!normalized) {
    return null;
  }

  let bestDirectMatch: { item: FaqItem; score: number } | null = null;
  let bestStrongQuestionMatch: { item: FaqItem; score: number } | null = null;

  for (const item of faqs) {
    const result = scoreFaqItem(item, normalized);

    if (result.directKeywordHit) {
      if (!bestDirectMatch || result.score > bestDirectMatch.score) {
        bestDirectMatch = {
          item,
          score: result.score,
        };
      }

      continue;
    }

    if (result.strongQuestionHit) {
      if (!bestStrongQuestionMatch || result.score > bestStrongQuestionMatch.score) {
        bestStrongQuestionMatch = {
          item,
          score: result.score,
        };
      }
    }
  }

  if (bestDirectMatch) {
    return bestDirectMatch;
  }

  // 只在问题文本与 FAQ 题干有明显重叠时才兜底匹配，避免把低频相关问题误归到 FAQ。
  if (!bestStrongQuestionMatch || bestStrongQuestionMatch.score < 12) {
    return null;
  }

  return bestStrongQuestionMatch;
}

export function getGuardrailReply(question: string) {
  const normalized = normalizeQuestion(question);

  if (!normalized) {
    return emptyReply;
  }

  if (emergencyKeywords.some((keyword) => normalized.includes(keyword))) {
    return emergencyReply;
  }

  if (medicalBoundaryKeywords.some((keyword) => normalized.includes(keyword))) {
    return medicalBoundaryReply;
  }

  return null;
}

export function getLocalAskReply(question: string) {
  const guardrailReply = getGuardrailReply(question);

  if (guardrailReply) {
    return guardrailReply;
  }

  const matchedFaq = matchFaq(question);

  if (!matchedFaq) {
    return null;
  }

  const { item } = matchedFaq;

  return {
    answer: item.answer,
    nextStep: item.nextStep,
    suggestDoctor: item.suggestDoctor,
    riskLevel: item.riskLevel,
    category: item.category,
    source: "faq" as const,
  };
}

export function getFallbackAskReply(reason: AskFallbackReason = "unknown") {
  return {
    ...fallbackReply,
    reason,
  };
}

export function getBusyAskReply(reason: "rate_limit" | "timeout") {
  return {
    ...busyReply,
    reason,
  };
}

export function shouldUseKimi(question: string) {
  const normalized = normalizeQuestion(question);

  if (!normalized) {
    return false;
  }

  return kimiScopeKeywords.some((keyword) => normalized.includes(keyword));
}

export function getClawReply(question: string): AskReply {
  return getLocalAskReply(question) ?? getFallbackAskReply();
}

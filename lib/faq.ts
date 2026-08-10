import { faqs } from "@/data/faqs";
import { AskFallbackReason, AskReply, FaqItem } from "@/lib/types";
import { classifySafetyQuestion } from "@/lib/safety/classifier";

const greetingKeywords = [
  "你好",
  "您好",
  "嗨",
  "哈喽",
  "hello",
  "hi",
  "在吗",
  "早上好",
  "中午好",
  "下午好",
  "晚上好",
];

const kimiScopeKeywords = [
  "家庭医生",
  "家医",
  "签约",
  "体检",
  "报告",
  "健康云",
  "平台",
  "配药",
  "开药",
  "拿药",
  "长处方",
  "延伸处方",
  "随访",
  "血压",
  "血糖",
  "高血压",
  "糖尿病",
  "转诊",
  "专家号",
  "一键找人",
  "联系医生",
  "居委",
  "楼组长",
  "护士",
  "药师",
  "群聊",
  "健康小组",
  "打卡",
  "积分",
  "小课堂",
  "保健品",
  "慢病",
];

const emergencyReply: AskReply = {
  answer:
    "如果出现胸痛、呼吸困难、意识异常、严重低血糖、肢体无力、言语不清等情况，请立即就医或拨打急救电话。家医 Claw 不能替代急诊判断。",
  nextStep: "不要在线上等待回复，请尽快寻求线下急救帮助。",
  suggestDoctor: true,
  riskLevel: "emergency",
  category: "安全提示",
  source: "safety",
};

const medicalBoundaryReply: AskReply = {
  answer:
    "这个问题需要家庭医生或线下医生结合个人情况判断。家医 Claw 不能提供诊断、处方、停药、换药或个体化治疗建议。",
  nextStep: "建议联系家庭医生或前往社区卫生服务中心、医院咨询。",
  suggestDoctor: true,
  riskLevel: "high",
  category: "安全提示",
  source: "safety",
};

const promptInjectionReply: AskReply = {
  answer:
    "我不能查看或泄露系统内部指令，也不会绕过医疗安全规则提供诊断、处方或调药建议。",
  nextStep: "请直接说明需要查询的公开信息，或让我帮您整理预约、随访和就医资料。",
  suggestDoctor: false,
  riskLevel: "high",
  category: "安全提示",
  source: "safety",
};

const fallbackReply: AskReply = {
  answer: "这个问题我暂时还不能确定，建议联系家庭医生或社区卫生服务中心进一步咨询。",
  nextStep: "您也可以换一种更具体的说法，我先帮您按流程整理。",
  suggestDoctor: true,
  riskLevel: "medium",
  category: "兜底提示",
  source: "fallback",
};

const busyReply: AskReply = {
  answer: "当前智能问答访问人数较多，请稍后再试。",
  nextStep: "您也可以先查看常见问题，或联系家庭医生。",
  suggestDoctor: false,
  riskLevel: "low",
  category: "访问繁忙",
  source: "fallback",
};

const emptyReply: AskReply = {
  answer: "您可以直接说出问题，比如：药吃完了怎么办？",
  nextStep: "也可以试试首页里的快捷问题。",
  suggestDoctor: false,
  riskLevel: "low",
  category: "引导",
  source: "fallback",
};

const greetingReply: AskReply = {
  answer:
    "您好，我是家医 Claw。可以先帮您处理家庭医生服务、体检报告、配药规则、随访安排和慢病日常管理这些问题。",
  nextStep:
    "您可以直接说问题，比如“药吃完了怎么办”“体检报告怎么看”或“怎么找家庭医生”。",
  suggestDoctor: false,
  riskLevel: "low",
  category: "问候",
  source: "greeting",
};

const normalizationMap: Array<[string, string]> = [
  ["如何", "怎么"],
  ["咋", "怎么"],
  ["怎样", "怎么"],
  ["登陆", "登录"],
  ["登入", "登录"],
  ["拿药", "配药"],
  ["开药", "配药"],
  ["药没了", "药吃完了"],
  ["小程序", "平台"],
  ["健康云平台", "健康云"],
  ["不会操作", "不会用"],
  ["检查结果", "体检报告"],
  ["社区医院", "社区卫生服务中心"],
];

const weakKeywords = new Set(["社区", "医生", "药", "报告", "体检", "怎么"]);

export function normalizeQuestion(question: string) {
  let normalized = question.trim().toLowerCase().replace(/\s+/g, "");

  for (const [from, to] of normalizationMap) {
    normalized = normalized.replaceAll(from, to);
  }

  return normalized;
}

function scoreFaqItem(item: FaqItem, normalized: string) {
  const itemQuestion = normalizeQuestion(item.question);
  let score = 0;
  let directKeywordHit = false;

  if (normalized === itemQuestion) {
    score += 80;
  } else if (normalized.includes(itemQuestion) || itemQuestion.includes(normalized)) {
    score += 36;
  }

  for (const keyword of item.keywords) {
    const normalizedKeyword = normalizeQuestion(keyword);

    if (!normalizedKeyword) {
      continue;
    }

    if (normalized.includes(normalizedKeyword)) {
      score += Math.max(18, normalizedKeyword.length * 5);
      if (normalizedKeyword.length >= 3 && !weakKeywords.has(normalizedKeyword)) {
        directKeywordHit = true;
      }
    } else if (normalizedKeyword.includes(normalized) && normalized.length >= 3) {
      score += 10;
    }
  }

  return { score, directKeywordHit };
}

export function matchFaqFromItems(question: string, items: FaqItem[]) {
  const normalized = normalizeQuestion(question);

  if (!normalized) {
    return null;
  }

  let bestMatch: { item: FaqItem; score: number; directKeywordHit: boolean } | null = null;

  for (const item of items) {
    const result = scoreFaqItem(item, normalized);

    if (!bestMatch || result.score > bestMatch.score) {
      bestMatch = {
        item,
        score: result.score,
        directKeywordHit: result.directKeywordHit,
      };
    }
  }

  if (!bestMatch) {
    return null;
  }

  if (bestMatch.directKeywordHit && bestMatch.score >= 18) {
    return bestMatch;
  }

  if (bestMatch.score >= 36) {
    return bestMatch;
  }

  return null;
}

export function matchFaq(question: string) {
  return matchFaqFromItems(question, faqs);
}

export function getGreetingReply(question: string) {
  const normalized = normalizeQuestion(question);
  return greetingKeywords.includes(normalized) ? greetingReply : null;
}

export function getGuardrailReply(question: string) {
  const normalized = normalizeQuestion(question);

  if (!normalized) {
    return emptyReply;
  }

  const safety = classifySafetyQuestion(question);
  if (safety === "emergency") return emergencyReply;
  if (safety === "prompt_injection") return promptInjectionReply;
  if (safety === "medical_boundary") return medicalBoundaryReply;

  return null;
}

export function buildFaqReply(item: FaqItem): AskReply {
  return {
    answer: item.answer,
    nextStep: item.nextStep,
    suggestDoctor: item.suggestDoctor,
    riskLevel: item.riskLevel,
    category: item.category,
    source: "faq",
  };
}

export function getLocalAskReply(question: string, faqItems: FaqItem[] = faqs): AskReply | null {
  const guardrailReply = getGuardrailReply(question);

  if (guardrailReply) {
    return guardrailReply;
  }

  const greeting = getGreetingReply(question);
  if (greeting) {
    return greeting;
  }

  const matchedFaq = matchFaqFromItems(question, faqItems);

  if (!matchedFaq) {
    return null;
  }

  return buildFaqReply(matchedFaq.item);
}

export function getFallbackAskReply(reason: AskFallbackReason = "unknown") {
  return {
    ...fallbackReply,
    reason,
  };
}

export function getBusyAskReply(reason: "rate_limit" | "timeout" | "auth_error") {
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

  return kimiScopeKeywords.some((keyword) => normalized.includes(normalizeQuestion(keyword)));
}

export function getClawReply(question: string) {
  return getLocalAskReply(question) ?? getFallbackAskReply();
}

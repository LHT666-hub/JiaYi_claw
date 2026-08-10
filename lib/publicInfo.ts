import { publicInfoItems } from "@/data/publicInfo";
import { normalizeQuestion } from "@/lib/faq";
import type { AskReply, PublicInfoItem } from "@/lib/types";

const weakPublicInfoKeywords = new Set([
  "社区",
  "医院",
  "门诊",
  "时间",
  "服务",
  "流程",
]);

function scorePublicInfoItem(item: PublicInfoItem, normalizedQuestion: string) {
  let score = 0;
  let hitCount = 0;
  const normalizedTitle = normalizeQuestion(item.title);

  if (normalizedQuestion === normalizedTitle) {
    score += 70;
  } else if (
    normalizedQuestion.includes(normalizedTitle) ||
    normalizedTitle.includes(normalizedQuestion)
  ) {
    score += 32;
  }

  for (const keyword of item.keywords) {
    const normalizedKeyword = normalizeQuestion(keyword);

    if (!normalizedKeyword) {
      continue;
    }

    if (normalizedQuestion.includes(normalizedKeyword)) {
      hitCount += 1;
      score += weakPublicInfoKeywords.has(normalizedKeyword)
        ? 6
        : Math.max(14, normalizedKeyword.length * 3);
    } else if (normalizedKeyword.includes(normalizedQuestion) && normalizedQuestion.length >= 5) {
      hitCount += 1;
      score += 12;
    }
  }

  return { score, hitCount };
}

export function matchPublicInfo(question: string) {
  const normalizedQuestion = normalizeQuestion(question);

  if (!normalizedQuestion) {
    return null;
  }

  const bestMatch = publicInfoItems
    .map((item) => ({
      item,
      ...scorePublicInfoItem(item, normalizedQuestion),
    }))
    .filter((entry) => entry.hitCount > 0 && entry.score >= 18)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.hitCount - a.hitCount;
    })[0];

  return bestMatch?.item ?? null;
}

export function buildPublicInfoReply(item: PublicInfoItem): AskReply {
  const ageMs = Date.now() - new Date(item.updatedAt).getTime();
  const stale = !Number.isFinite(ageMs) || ageMs > 365 * 24 * 60 * 60 * 1000;
  if (stale) {
    return {
      answer: `我找到了与这个问题相关的公开资料，但资料最后更新于 ${item.updatedAt}，已经超过核验有效期，不能作为当前办理依据。历史资料的主题是：${item.summary}`,
      nextStep: `请先通过原始来源或社区卫生服务中心核实最新安排。来源：${item.sourceName} ${item.sourceUrl}`,
      suggestDoctor: false,
      riskLevel: "low",
      category: item.category,
      source: "knowledge",
      knowledgeIds: [item.id],
    };
  }

  return {
    answer: `根据公开信息整理：${item.summary}\n\n${item.details}`,
    nextStep: `${item.nextStep}\n来源：${item.sourceName}（${item.updatedAt}）${item.sourceUrl}`,
    suggestDoctor: item.suggestDoctor ?? false,
    riskLevel: item.suggestDoctor ? "medium" : "low",
    category: item.category,
    source: "knowledge",
    knowledgeIds: [item.id],
  };
}

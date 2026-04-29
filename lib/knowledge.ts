import { publicInfoItems } from "@/data/publicInfo";
import { matchFaq, normalizeQuestion } from "@/lib/faq";
import { AskReply, KnowledgeSnippet, PublicInfoItem } from "@/lib/types";

function scorePublicInfoItem(item: PublicInfoItem, normalized: string) {
  let score = 0;
  let directKeywordHit = false;
  const normalizedTitle = normalizeQuestion(item.title);

  if (normalized === normalizedTitle) {
    score += 70;
  } else if (normalized.includes(normalizedTitle) || normalizedTitle.includes(normalized)) {
    score += 32;
  }

  for (const keyword of item.keywords) {
    const normalizedKeyword = normalizeQuestion(keyword);

    if (!normalizedKeyword) {
      continue;
    }

    if (normalized.includes(normalizedKeyword)) {
      score += Math.max(18, normalizedKeyword.length * 4);
      if (normalizedKeyword.length >= 3) {
        directKeywordHit = true;
      }
    } else if (normalizedKeyword.includes(normalized) && normalized.length >= 3) {
      score += 8;
    }
  }

  return { score, directKeywordHit };
}

function mapFaqToKnowledge(question: string): KnowledgeSnippet[] {
  const matchedFaq = matchFaq(question);

  if (!matchedFaq) {
    return [];
  }

  const { item } = matchedFaq;

  return [
    {
      id: item.id,
      title: item.question,
      category: item.category,
      summary: item.answer,
      details: item.answer,
      nextStep: item.nextStep,
      sourceName: "家医 Claw 本地知识库",
      suggestDoctor: item.suggestDoctor,
      sourceType: "faq",
    },
  ];
}

function mapPublicInfoToKnowledge(question: string): KnowledgeSnippet[] {
  const normalized = normalizeQuestion(question);

  const scored = publicInfoItems
    .map((item) => ({
      item,
      ...scorePublicInfoItem(item, normalized),
    }))
    .filter((result) => result.directKeywordHit || result.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map(({ item }) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    summary: item.summary,
    details: item.details,
    nextStep: item.nextStep,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    updatedAt: item.updatedAt,
    suggestDoctor: item.suggestDoctor ?? false,
    sourceType: "public",
  }));
}

export function retrieveKnowledge(question: string) {
  const snippets = [...mapFaqToKnowledge(question), ...mapPublicInfoToKnowledge(question)];
  const seen = new Set<string>();

  return snippets.filter((snippet) => {
    if (seen.has(snippet.id)) {
      return false;
    }

    seen.add(snippet.id);
    return true;
  });
}

export function buildKnowledgeFallbackReply(question: string, snippets: KnowledgeSnippet[]): AskReply {
  const topSnippet = snippets[0];
  const relatedSources = snippets
    .slice(0, 2)
    .map((snippet) => snippet.sourceName)
    .filter((value, index, list) => list.indexOf(value) === index);

  const lead =
    topSnippet.summary.length > 110
      ? `${topSnippet.summary.slice(0, 110)}…`
      : topSnippet.summary;

  const sourceText =
    relatedSources.length > 0 ? `我先按公开信息整理给您：${relatedSources.join("、")}。` : "我先按现有公开信息整理给您。";

  return {
    answer: `${sourceText}${lead}`,
    nextStep: topSnippet.nextStep,
    suggestDoctor: snippets.some((snippet) => snippet.suggestDoctor),
    riskLevel: "low",
    category: topSnippet.category,
    source: "knowledge",
  };
}

export function buildClarifyReply(question: string): AskReply {
  const normalized = normalizeQuestion(question);

  if (normalized.includes("医保") || normalized.includes("政策")) {
    return {
      answer:
        "您这个问题范围有点大，我可以先按公开信息帮您分流。像“上海医保政策”通常要先分清是问报销、社区配药、家庭医生签约、转诊，还是互联网医院复诊配药。",
      nextStep:
        "您可以继续说得更具体一点，例如“上海社区配药怎么配”“家庭医生签约后能享受什么”或“复诊配药能不能线上办理”。",
      suggestDoctor: false,
      riskLevel: "low",
      category: "信息分流",
      source: "knowledge",
    };
  }

  return {
    answer:
      "这个问题我暂时没有检索到足够的公开材料，但它看起来像是社区服务流程问题，不一定需要直接打扰医生。",
    nextStep:
      "您可以把问题说得更具体一点，例如补充所在地区、想问的是配药、体检、随访、公众号通知，还是家庭医生服务。",
    suggestDoctor: false,
    riskLevel: "low",
    category: "信息分流",
    source: "fallback",
    reason: "no_faq_match",
  };
}

export function buildKnowledgePrompt(question: string, snippets: KnowledgeSnippet[]) {
  const knowledgeBlock = snippets
    .map((snippet, index) => {
      const meta = [
        `标题：${snippet.title}`,
        `分类：${snippet.category}`,
        `摘要：${snippet.summary}`,
        `详细信息：${snippet.details}`,
        `下一步建议：${snippet.nextStep}`,
        `来源：${snippet.sourceName}${snippet.sourceUrl ? `（${snippet.sourceUrl}）` : ""}`,
        snippet.updatedAt ? `更新时间：${snippet.updatedAt}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      return `材料 ${index + 1}\n${meta}`;
    })
    .join("\n\n");

  return `用户问题：${question}

以下是已经检索到的公开材料和本地知识。请只根据这些材料回答，不要补充材料外的新事实，不要做诊断、处方、停药、换药、剂量调整、检查结果严重程度判断或个体化治疗建议。

如果材料已经足够，请用温和、简明、适合老年居民理解的话整理成答复。
如果材料只能回答一部分，请明确说明“先按公开信息理解”，不要硬编。
请优先回答居民真正想知道的操作路径和区别，再给一个简短的下一步建议。

请严格按下面格式输出，不要添加多余标题：
回答：...
下一步建议：...
是否建议联系家庭医生：是/否
风险等级：low|medium|high|emergency

${knowledgeBlock}`;
}

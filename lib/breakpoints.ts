import { AskLogItem } from "@/lib/types";

export type BreakpointCategory =
  | "入口不会用"
  | "报告解释断点"
  | "配药规则断点"
  | "联系医生断点"
  | "群聊边界断点"
  | "积分任务理解断点"
  | "安全风险问题";

export type BreakpointItem = {
  category: BreakpointCategory;
  count: number;
  exampleQuestion: string;
  suggestion: string;
};

const categoryRules: Array<{
  category: BreakpointCategory;
  keywords: string[];
  suggestion: string;
}> = [
  {
    category: "安全风险问题",
    keywords: ["停药", "换药", "剂量", "加药", "减药", "胸痛", "呼吸困难", "意识", "昏迷", "抽搐", "诊断", "住院"],
    suggestion: "强化安全提示的表述清晰度，确认居民理解「不提供诊断」的边界",
  },
  {
    category: "入口不会用",
    keywords: ["不会用", "怎么进", "在哪里", "找不到", "操作", "登录", "手机", "小程序", "平台", "健康云"],
    suggestion: "增加首页引导提示或新手引导流程，简化入口路径",
  },
  {
    category: "报告解释断点",
    keywords: ["报告", "体检", "检查", "指标", "异常", "看不懂", "结果", "化验"],
    suggestion: "增加体检报告常见指标的通俗解释模板",
  },
  {
    category: "配药规则断点",
    keywords: ["配药", "开药", "拿药", "药没了", "长处方", "延伸处方", "药品", "社区没有"],
    suggestion: "补充社区配药 vs 医院配药的 FAQ 覆盖度",
  },
  {
    category: "联系医生断点",
    keywords: ["找医生", "联系", "李医生", "家庭医生", "约", "预约", "挂号", "转诊"],
    suggestion: "优化「一键找人」入口的可见度和操作流程",
  },
  {
    category: "群聊边界断点",
    keywords: ["群", "小组", "打卡", "群聊", "组长", "群里"],
    suggestion: "明确群聊功能边界说明，引导非群聊问题到问 Claw",
  },
  {
    category: "积分任务理解断点",
    keywords: ["积分", "任务", "小课", "奖励", "兑换", "怎么得分", "分数"],
    suggestion: "在任务页增加积分规则说明入口，降低理解门槛",
  },
];

function classifyQuestion(question: string): BreakpointCategory {
  const q = question.toLowerCase();

  for (const rule of categoryRules) {
    if (rule.keywords.some((kw) => q.includes(kw))) {
      return rule.category;
    }
  }

  return "入口不会用";
}

export function analyzeBreakpoints(askLogs: AskLogItem[]): BreakpointItem[] {
  const buckets = new Map<BreakpointCategory, { count: number; examples: string[] }>();

  for (const log of askLogs) {
    const isBreakpoint =
      log.source === "fallback" ||
      log.source === "safety" ||
      log.suggestDoctor ||
      log.riskLevel === "high" ||
      log.riskLevel === "emergency";

    if (!isBreakpoint) continue;

    const category = classifyQuestion(log.question);
    const bucket = buckets.get(category) ?? { count: 0, examples: [] };
    bucket.count++;
    if (bucket.examples.length < 3) {
      bucket.examples.push(log.question);
    }
    buckets.set(category, bucket);
  }

  const suggestionMap = new Map(categoryRules.map((r) => [r.category, r.suggestion]));

  const results: BreakpointItem[] = [];
  for (const [category, bucket] of buckets) {
    results.push({
      category,
      count: bucket.count,
      exampleQuestion: bucket.examples[0] ?? "",
      suggestion: suggestionMap.get(category) ?? "",
    });
  }

  results.sort((a, b) => b.count - a.count);
  return results.slice(0, 5);
}

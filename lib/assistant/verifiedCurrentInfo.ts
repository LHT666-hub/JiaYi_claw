import type { AskReply } from "@/lib/types";

const currentTerms = /今天|今日|最近|近期|本周|这周|下周|本月|这个月|最新|现在|当前|明天|周末/;
const changingInfoTerms = /排班|坐班|出诊|门诊|医生|专家|活动|义诊|讲座|课程|体检|疫苗|接种|通知|公告|停诊|开放时间/;
const serviceIntentTerms = /帮我(?:预约|挂号|申请)|我要(?:预约|挂号|申请)|我想(?:预约|挂号|申请)|预约一下|申请转诊/;

export function requiresVerifiedCurrentInfo(question: string) {
  const text = question.replace(/\s+/g, "");
  return !serviceIntentTerms.test(text) && currentTerms.test(text) && changingInfoTerms.test(text);
}

export function buildCurrentInfoNotFoundReply(): AskReply {
  return {
    answer:
      "我已经检索了当前社区已审核的信息，但没有找到仍在有效期内、能回答这个问题的排班或活动公告。我不能用历史资料或猜测代替最新安排。",
    nextStep:
      "请到“服务”查看已核验的最新内容，或联系所属社区卫生服务中心；有新公告审核发布后，Claw 才会据此回答。",
    suggestDoctor: false,
    riskLevel: "low",
    category: "时效信息未命中",
    source: "fallback",
    knowledgeIds: [],
    citations: [],
  };
}

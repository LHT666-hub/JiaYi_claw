export type SafetyClassification =
  | "emergency"
  | "medical_boundary"
  | "prompt_injection";

const emergencyKeywords = [
  "胸痛",
  "胸口痛",
  "胸口疼",
  "呼吸困难",
  "喘不上气",
  "喘勿过气",
  "不能呼吸",
  "嘴唇发紫",
  "意识异常",
  "意识不清",
  "叫不醒",
  "失去意识",
  "昏迷",
  "晕倒",
  "抽搐",
  "严重低血糖",
  "大出血",
  "大量出血",
  "血止不住",
  "止不住血",
  "肢体无力",
  "一边手脚没力",
  "半边身子动不了",
  "言语不清",
  "说话含糊",
  "口角歪斜",
  "剧烈胸闷",
  "自杀",
  "轻生",
  "不想活",
  "勿想活",
  "结束自己的生命",
  "伤害自己",
  "吞了很多药",
  "过量服药",
  "剧烈头痛",
  "打120",
  "拨打120",
  "叫救护车",
];

const emergencyPatterns = [
  /(?:流血|出血).{0,10}止不住/,
  /血.{0,6}(?:流|淌).{0,10}止不住/,
  /止不住.{0,10}(?:流血|出血)/,
  /突然.{0,6}(?:嘴歪|口角歪斜)/,
];

const medicalBoundaryKeywords = [
  "停药",
  "换药",
  "药量",
  "剂量",
  "加药",
  "减药",
  "减半",
  "能不能不吃药",
  "报告严不严重",
  "是不是得了",
  "要不要住院",
  "诊断",
  "治疗方案",
  "开处方",
  "给我开药",
  "处方能不能开",
  "直接开药",
];

const medicalBoundaryPatterns = [
  /(?:停|停脱|换|加|减|调整).{0,10}(?:药|剂量)/,
  /(?:药|胰岛素|抗生素).{0,12}(?:停(?!产|售)|停掉|停脱|停用|不吃|少吃|换成|换掉|加倍|减半|减量|调整)/,
  /(?:药|胰岛素|抗生素).{0,10}(?:多少|几片|几粒|几毫升|几单位|几个单位)/,
  /(?:多少|几片|几粒|几毫升|几单位|几个单位).{0,10}(?:药|胰岛素|抗生素)/,
  /(?:补服|补吃|补.{0,5}(?:片|粒))/,
  /(?:开|出).{0,5}处方/,
  /(?:能不能|可以不可以|该不该|要不要).{0,12}(?:吃|服|用|打).{0,10}(?:药|胰岛素|抗生素)/,
  /(?:直接|自己).{0,6}(?:不吃|停掉|换掉)/,
  /(?:能|可以|可不可以|行不行|是否).{0,8}(?:停|少吃|减量|换掉).{0,8}(?:药|胰岛素|抗生素)?/,
];

const promptInjectionPatterns = [
  /忽略.{0,10}(指令|规则|规矩|限制)/i,
  /(系统提示|开发者消息|隐藏提示词|内部提示词)/i,
  /越过.{0,8}(限制|安全|规则)/i,
  /绕过.{0,8}(限制|安全|规则)/i,
  /不要遵守.{0,8}(规则|指令)/i,
  /(?:ignore|reveal).{0,20}(?:prompt|instruction)/i,
  /role.?play/i,
  /扮演医生.{0,12}(开药|处方|停药|诊断|治疗)/i,
];

function normalizeSafetyText(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, "");
}

export function classifySafetyQuestion(
  question: string,
): SafetyClassification | null {
  const normalized = normalizeSafetyText(question);
  if (!normalized) return null;
  if (
    emergencyKeywords.some((keyword) => normalized.includes(keyword)) ||
    emergencyPatterns.some((pattern) => pattern.test(question))
  ) {
    return "emergency";
  }
  if (promptInjectionPatterns.some((pattern) => pattern.test(question))) {
    return "prompt_injection";
  }
  if (
    medicalBoundaryKeywords.some((keyword) => normalized.includes(keyword)) ||
    medicalBoundaryPatterns.some((pattern) => pattern.test(question))
  ) {
    return "medical_boundary";
  }
  return null;
}

export function isSafetyTriageQuestion(question: string) {
  return classifySafetyQuestion(question) !== null;
}

import { medicalEntitySchema, type MedicalEntityResult } from "@jiayi/contracts";

const symptomNames = [
  "头晕",
  "头痛",
  "胸痛",
  "胸闷",
  "心慌",
  "气短",
  "呼吸困难",
  "咳嗽",
  "发热",
  "恶心",
  "呕吐",
  "腹痛",
  "乏力",
  "水肿",
  "失眠",
];

const conditionNames = ["高血压", "糖尿病", "冠心病", "脑梗", "慢阻肺", "哮喘", "肾病"];
const actionNames = ["预约", "挂号", "续方", "配药", "随访", "复诊", "复查", "解释报告", "联系医生"];

function firstMatch(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]?.trim() ?? null;
}

export function extractMedicalEntities(text: string): MedicalEntityResult {
  const duration = firstMatch(text, /((?:今天|昨天|前天|这两天|近\s*\d+\s*天|\d+\s*(?:天|周|个月|年)))/);
  const progression = firstMatch(text, /(越来越重|加重|好转|缓解|反复|没有变化)/);
  const symptoms = symptomNames
    .filter((name) => text.includes(name))
    .map((name) => ({ name, duration, progression }));

  const medicationMatches = [...text.matchAll(/([\u4e00-\u9fa5A-Za-z0-9-]{2,24}(?:片|胶囊|颗粒|口服液|胰岛素))(?:(\d+(?:\.\d+)?\s*(?:mg|g|毫克|克|单位)))?/gi)];
  const medications = medicationMatches.map((match) => ({
    name: match[1],
    dosage: match[2] ?? null,
    frequency: firstMatch(text, /(每天\s*\d+\s*次|一天\s*\d+\s*次|早晚各一次|睡前一次)/),
  }));

  const measurements: MedicalEntityResult["measurements"] = [];
  const bp = text.match(/(?:血压)?\s*(\d{2,3})\s*[/／]\s*(\d{2,3})/);
  if (bp) measurements.push({ type: "blood_pressure", value: `${bp[1]}/${bp[2]}`, unit: "mmHg", timestamp: duration });
  const glucose = text.match(/(?:血糖)\s*(\d+(?:\.\d+)?)/);
  if (glucose) measurements.push({ type: "blood_glucose", value: glucose[1], unit: "mmol/L", timestamp: duration });
  const weight = text.match(/(?:体重)\s*(\d+(?:\.\d+)?)\s*(?:公斤|kg|千克)/i);
  if (weight) measurements.push({ type: "weight", value: weight[1], unit: "kg", timestamp: duration });

  const requestedActions = actionNames.filter((name) => text.includes(name));
  const missingInformation: string[] = [];
  if (symptoms.length && !duration) missingInformation.push("症状开始时间");
  if (requestedActions.some((item) => item === "预约" || item === "挂号")) {
    if (!/(今天|明天|后天|周[一二三四五六日天]|上午|下午|晚上|\d{1,2}月\d{1,2}日)/.test(text)) {
      missingInformation.push("希望预约的日期或时段");
    }
  }

  return medicalEntitySchema.parse({
    symptoms,
    medications,
    measurements,
    mentionedConditions: conditionNames.filter((name) => text.includes(name)),
    requestedActions,
    missingInformation,
  });
}

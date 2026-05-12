import { GroupLeader, groupLeaders } from "@/data/groupLeaders";

export type MatchFormData = {
  area: string;
  chronicTags: string[];
  phoneDifficulty: boolean;
  elderlyAlone: boolean;
  healthCheckNeed: boolean;
  checkInWilling: boolean;
  antiScamNeed: boolean;
};

export type MatchResult = {
  leader: GroupLeader;
  score: number;
  maxScore: number;
  matchPercent: number;
  matchReasons: string[];
};

const SCORE_AREA = 30;
const SCORE_CHRONIC = 25;
const SCORE_PHONE = 25;
const SCORE_ELDER = 20;
const SCORE_HEALTH_CHECK = 20;
const SCORE_CHECKIN = 20;
const SCORE_ANTI_SCAM = 15;

export function matchLeaders(form: MatchFormData): MatchResult[] {
  const maxScore =
    SCORE_AREA +
    SCORE_CHRONIC +
    SCORE_PHONE +
    SCORE_ELDER +
    SCORE_HEALTH_CHECK +
    SCORE_CHECKIN +
    SCORE_ANTI_SCAM;

  const results: MatchResult[] = groupLeaders.map((leader) => {
    let score = 0;
    const reasons: string[] = [];

    // Area match (+30)
    if (form.area && leader.area === form.area) {
      score += SCORE_AREA;
      reasons.push(`同属${form.area}`);
    }

    // Chronic tag overlap (+25)
    if (form.chronicTags.length > 0 && leader.chronicTags.length > 0) {
      const overlap = form.chronicTags.filter((tag) => leader.chronicTags.includes(tag));
      if (overlap.length > 0) {
        score += SCORE_CHRONIC;
        reasons.push(`共同关注：${overlap.join("、")}`);
      }
    }

    // Phone difficulty (+25)
    if (form.phoneDifficulty && leader.phoneHelp) {
      score += SCORE_PHONE;
      reasons.push("擅长手机操作指导");
    }

    // Elderly / alone (+20)
    if (form.elderlyAlone && leader.elderCare) {
      score += SCORE_ELDER;
      reasons.push("关注独居/高龄老人");
    }

    // Health check need (+20)
    if (form.healthCheckNeed && leader.healthCheckHelp) {
      score += SCORE_HEALTH_CHECK;
      reasons.push("可协助体检登记");
    }

    // Check-in willingness (+20)
    if (form.checkInWilling && leader.checkInActive) {
      score += SCORE_CHECKIN;
      reasons.push("打卡活跃，带动氛围");
    }

    // Anti-scam need (+15)
    if (form.antiScamNeed && leader.antiScam) {
      score += SCORE_ANTI_SCAM;
      reasons.push("提供防诈提醒");
    }

    const matchPercent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

    return { leader, score, maxScore, matchPercent, matchReasons: reasons };
  });

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export const areaOptions = ["海湾社区", "滨海花园"];
export const chronicTagOptions = ["高血压", "糖尿病", "冠心病", "骨质疏松", "其他"];

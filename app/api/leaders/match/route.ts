import { NextRequest, NextResponse } from "next/server";
import { getActiveLeaders, insertLeaderMatches, GroupLeaderRow } from "@/lib/db/leaders";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

type MatchFormBody = {
  area?: string;
  chronicTags?: string[];
  phoneDifficulty?: boolean;
  elderlyAlone?: boolean;
  healthCheckNeed?: boolean;
  checkInWilling?: boolean;
  antiScamNeed?: boolean;
};

const SCORE_AREA = 30;
const SCORE_CHRONIC = 25;
const SCORE_PHONE = 25;
const SCORE_ELDER = 20;
const SCORE_HEALTH_CHECK = 20;
const SCORE_CHECKIN = 20;
const SCORE_ANTI_SCAM = 15;

function scoreLeader(leader: GroupLeaderRow, form: MatchFormBody) {
  let score = 0;
  const reasons: string[] = [];

  if (form.area && leader.area === form.area) {
    score += SCORE_AREA;
    reasons.push(`同属${form.area}`);
  }

  const chronicTags = form.chronicTags ?? [];
  if (chronicTags.length > 0 && leader.tags.length > 0) {
    const overlap = chronicTags.filter((t) => leader.tags.includes(t));
    if (overlap.length > 0) {
      score += SCORE_CHRONIC;
      reasons.push(`共同关注：${overlap.join("、")}`);
    }
  }

  // Phone difficulty: check if "手机" appears in strengths or suitable_for
  if (form.phoneDifficulty) {
    const hasPhoneHelp =
      leader.strengths.some((s) => s.includes("手机")) ||
      leader.suitable_for.some((s) => s.includes("手机"));
    if (hasPhoneHelp) {
      score += SCORE_PHONE;
      reasons.push("擅长手机操作指导");
    }
  }

  if (form.elderlyAlone) {
    const hasElderCare =
      leader.suitable_for.some((s) => s.includes("独居") || s.includes("高龄")) ||
      leader.strengths.some((s) => s.includes("关怀") || s.includes("陪伴"));
    if (hasElderCare) {
      score += SCORE_ELDER;
      reasons.push("关注独居/高龄老人");
    }
  }

  if (form.healthCheckNeed) {
    const hasHealthCheck =
      leader.strengths.some((s) => s.includes("登记") || s.includes("体检")) ||
      leader.suitable_for.some((s) => s.includes("体检"));
    if (hasHealthCheck) {
      score += SCORE_HEALTH_CHECK;
      reasons.push("可协助体检登记");
    }
  }

  if (form.checkInWilling) {
    const hasCheckIn =
      leader.strengths.some((s) => s.includes("打卡")) ||
      leader.suitable_for.some((s) => s.includes("打卡"));
    if (hasCheckIn) {
      score += SCORE_CHECKIN;
      reasons.push("打卡活跃，带动氛围");
    }
  }

  if (form.antiScamNeed) {
    const hasAntiScam =
      leader.strengths.some((s) => s.includes("防诈")) ||
      leader.suitable_for.some((s) => s.includes("防诈"));
    if (hasAntiScam) {
      score += SCORE_ANTI_SCAM;
      reasons.push("提供防诈提醒");
    }
  }

  const maxScore =
    SCORE_AREA + SCORE_CHRONIC + SCORE_PHONE + SCORE_ELDER +
    SCORE_HEALTH_CHECK + SCORE_CHECKIN + SCORE_ANTI_SCAM;
  const matchPercent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  return { score, matchPercent, reasons };
}

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json(
      { message: "当前未登录或 Supabase 未配置" },
      { status: 401 },
    );
  }

  const body = (await request.json()) as MatchFormBody;

  const leaders = await getActiveLeaders(supabase);

  if (!leaders.length) {
    return NextResponse.json(
      { ok: false, message: "暂无可用小组长数据" },
      { status: 404 },
    );
  }

  // Score each leader
  const scored = leaders
    .map((leader) => {
      const { score, matchPercent, reasons } = scoreLeader(leader, body);
      return { leader, score, matchPercent, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // Collect the needs for logging
  const needs: string[] = [];
  if (body.area) needs.push(`社区:${body.area}`);
  if (body.chronicTags?.length) needs.push(`慢病:${body.chronicTags.join(",")}`);
  if (body.phoneDifficulty) needs.push("手机操作困难");
  if (body.elderlyAlone) needs.push("独居/高龄");
  if (body.healthCheckNeed) needs.push("体检登记");
  if (body.checkInWilling) needs.push("打卡意愿");
  if (body.antiScamNeed) needs.push("防诈需求");

  // Write matches to DB
  const insertResult = await insertLeaderMatches(
    profile.id,
    scored.map((s) => ({
      leaderId: s.leader.id,
      score: s.score,
      reasons: s.reasons,
      needs,
    })),
    supabase,
  );

  const results = scored.map((s, idx) => ({
    matchId: insertResult.ok && insertResult.matches ? insertResult.matches[idx]?.id : null,
    leader: {
      id: s.leader.id,
      name: s.leader.name,
      roleLabel: s.leader.role_label,
      area: s.leader.area,
      tags: s.leader.tags,
      strengths: s.leader.strengths,
      description: s.leader.description,
      avatarUrl: s.leader.avatar_url,
    },
    score: s.score,
    matchPercent: s.matchPercent,
    reasons: s.reasons,
  }));

  return NextResponse.json({ ok: true, results });
}

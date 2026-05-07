import { NextResponse } from "next/server";
import { getResidentPointsSummary } from "@/lib/db/points";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function GET() {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置" }, { status: 401 });
  }

  try {
    const summary = await getResidentPointsSummary(profile.id, supabase);

    return NextResponse.json({
      ok: true,
      totalPoints: summary.totalPoints,
      recentLedger: summary.recentLedger,
      recentEntries: summary.recentLedger,
    });
  } catch {
    return NextResponse.json({ message: "积分汇总读取失败" }, { status: 500 });
  }
}

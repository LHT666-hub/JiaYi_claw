import { NextResponse } from "next/server";
import { getCourseViewsForResident } from "@/lib/db/courses";
import { getResidentPointsSummary } from "@/lib/db/points";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function GET() {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置" }, { status: 401 });
  }

  if (profile.role !== "resident" && profile.role !== "family") {
    return NextResponse.json({ message: "当前角色无法查看课程进度" }, { status: 403 });
  }

  try {
    const [views, pointsSummary] = await Promise.all([
      getCourseViewsForResident(profile.id, supabase),
      getResidentPointsSummary(profile.id, supabase),
    ]);

    return NextResponse.json({
      ok: true,
      viewedCourseIds: [...new Set(views.map((item) => item.course_id))],
      totalPoints: pointsSummary.totalPoints,
      recentLedger: pointsSummary.recentLedger,
    });
  } catch {
    return NextResponse.json({ message: "课程进度读取失败" }, { status: 500 });
  }
}

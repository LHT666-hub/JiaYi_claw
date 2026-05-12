import { NextRequest, NextResponse } from "next/server";
import { recordCourseView } from "@/lib/db/courses";
import { createNotification } from "@/lib/db/notifications";
import { addPointsLedger } from "@/lib/db/points";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json(
      { message: "当前未登录或 Supabase 未配置" },
      { status: 401 },
    );
  }

  if (profile.role !== "resident" && profile.role !== "family") {
    return NextResponse.json(
      { message: "仅居民或家属可记录课程观看" },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    courseId?: string;
    points?: number;
  };

  if (!body.courseId) {
    return NextResponse.json({ message: "缺少课程 ID" }, { status: 400 });
  }

  const points = body.points ?? 0;
  const residentId = profile.id;

  const result = await recordCourseView(residentId, body.courseId, points, supabase);

  if (!result.ok) {
    if (result.duplicate) {
      return NextResponse.json({ ok: false, duplicate: true, message: result.message });
    }
    return NextResponse.json({ message: result.message }, { status: 500 });
  }

  if (points > 0) {
    await addPointsLedger({
      residentId,
      change: points,
      reason: "观看课程获得积分",
      sourceType: "course",
      sourceId: body.courseId,
      supabase,
    });
  }

  if (points > 0) {
    try {
      await createNotification(
        {
          userId: residentId,
          type: "points_changed",
          title: `观看课程获得 ${points} 积分`,
          content: "继续学习可以获得更多积分。",
          linkUrl: "/courses",
        },
        supabase,
      );
    } catch {
      // best effort
    }
  }

  return NextResponse.json({
    ok: true,
    view: result.view,
    pointsAwarded: points,
  });
}

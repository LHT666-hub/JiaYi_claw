import { NextResponse } from "next/server";
import { getAskDashboardMetrics } from "@/lib/db/askLogs";
import { getNotifications } from "@/lib/db/notifications";
import { getDoctorTodosForUser } from "@/lib/db/doctorTodos";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function GET() {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json(
      { message: "当前未登录，或账号服务暂时不可用。" },
      { status: 401 },
    );
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ message: "当前身份暂无管理员权限。" }, { status: 403 });
  }

  try {
    const [
      askMetrics,
      todos,
      pointsLedgerResult,
      groupMessageCountResult,
      matchLeaderCountResult,
      notifications,
    ] = await Promise.all([
      getAskDashboardMetrics(supabase),
      getDoctorTodosForUser(profile.id, profile.role, supabase),
      supabase.from("points_ledger").select("change").gt("change", 0),
      supabase.from("group_messages").select("id", { count: "exact", head: true }),
      supabase.from("leader_matches").select("id", { count: "exact", head: true }),
      getNotifications(profile.id, supabase, { limit: 200 }),
    ]);

    const pointRows = (pointsLedgerResult.data ?? []) as Array<{ change: number | null }>;
    const totalPointsAwarded = pointRows.reduce(
      (sum, item) => sum + Number(item.change ?? 0),
      0,
    );
    const feedbackCount = notifications.filter(
      (item) => item.type === "system" && item.metadata?.kind === "feedback_submission",
    ).length;

    return NextResponse.json({
      ok: true,
      askCountToday: askMetrics.askCountToday,
      faqHitCount: askMetrics.faqHitCount,
      safetyBlockCount: askMetrics.safetyBlockCount,
      kimiCount: askMetrics.kimiCount,
      fallbackCount: askMetrics.fallbackCount,
      doctorTodoCount: todos.length,
      totalPointsAwarded,
      groupMessageCount: groupMessageCountResult.count ?? 0,
      feedbackCount,
      matchLeaderCount: matchLeaderCountResult.count ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "运行看板读取失败。" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { getAskDashboardMetrics } from "@/lib/db/askLogs";
import { getDoctorTodosForUser } from "@/lib/db/doctorTodos";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function GET() {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置" }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ message: "当前身份暂无管理员权限" }, { status: 403 });
  }

  try {
    const [askMetrics, todos] = await Promise.all([
      getAskDashboardMetrics(supabase),
      getDoctorTodosForUser(profile.id, profile.role, supabase),
    ]);

    return NextResponse.json({
      ok: true,
      askCountToday: askMetrics.askCountToday,
      faqHitCount: askMetrics.faqHitCount,
      safetyBlockCount: askMetrics.safetyBlockCount,
      kimiCount: askMetrics.kimiCount,
      fallbackCount: askMetrics.fallbackCount,
      doctorTodoCount: todos.length,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "运行看板读取失败" },
      { status: 500 },
    );
  }
}

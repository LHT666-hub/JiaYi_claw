import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/db/audit";
import { createNotification } from "@/lib/db/notifications";
import { completeTask } from "@/lib/db/tasks";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录" }, { status: 401 });
  }

  if (profile.role !== "resident") {
    return NextResponse.json({ message: "当前角色暂不支持完成任务" }, { status: 403 });
  }

  const body = (await request.json()) as {
    taskId?: string;
    note?: string;
  };

  const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
  if (!taskId) {
    return NextResponse.json({ message: "缺少 taskId" }, { status: 400 });
  }

  const result = await completeTask({
    taskId,
    residentId: profile.id,
    actorId: profile.id,
    note: typeof body.note === "string" ? body.note : null,
    supabase,
  });

  if (!result.ok) {
    const status = result.message === "任务不存在或未启用" ? 404 : 400;
    return NextResponse.json({ message: result.message ?? "任务写入失败" }, { status });
  }

  await writeAuditLog({
    actorId: profile.id,
    action: "task.complete",
    targetTable: "task_records",
    targetId: result.record?.id ?? null,
    detail: {
      residentId: profile.id,
      taskId,
      alreadyCompleted: result.alreadyCompleted,
      totalPoints: result.balanceAfter,
    },
    supabase,
  });

  if (!result.alreadyCompleted) {
    try {
      const { data: taskRow } = (await supabase
        .from("tasks")
        .select("title, points")
        .eq("id", taskId)
        .maybeSingle()) as {
        data: { title: string; points: number } | null;
      };

      await createNotification(
        {
          userId: profile.id,
          actorId: profile.id,
          type: "task_completed",
          title: "今日健康小事已完成",
          content: `您完成了「${taskRow?.title ?? "健康小事"}」，获得 ${taskRow?.points ?? 0} 积分。`,
          linkUrl: "/tasks",
          metadata: {
            taskId,
          },
        },
        supabase,
      );
    } catch {
      // best effort
    }
  }

  return NextResponse.json({
    ok: true,
    already_completed: result.alreadyCompleted,
    alreadyCompleted: result.alreadyCompleted,
    message: result.alreadyCompleted ? "今天已经完成过这个任务了" : "任务完成成功",
    totalPoints: result.balanceAfter,
    points: result.balanceAfter,
  });
}

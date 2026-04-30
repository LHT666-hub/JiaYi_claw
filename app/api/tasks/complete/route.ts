import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/db/audit";
import { completeTask } from "@/lib/db/tasks";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置。" }, { status: 401 });
  }

  if (profile.role !== "resident" && profile.role !== "admin") {
    return NextResponse.json({ message: "当前角色暂不支持代为完成任务。" }, { status: 403 });
  }

  const body = (await request.json()) as {
    taskId?: string;
    residentId?: string;
    note?: string;
  };
  const taskId = typeof body.taskId === "string" ? body.taskId : "";

  if (!taskId) {
    return NextResponse.json({ message: "缺少 taskId。" }, { status: 400 });
  }

  const residentId =
    profile.role === "admin" && typeof body.residentId === "string" && body.residentId
      ? body.residentId
      : profile.id;

  const result = await completeTask({
    taskId,
    residentId,
    actorId: profile.id,
    note: typeof body.note === "string" ? body.note : null,
    supabase,
  });

  if (!result.ok) {
    return NextResponse.json(
      { message: result.message ?? "任务写入失败。" },
      { status: result.message === "任务不存在" ? 404 : 400 },
    );
  }

  await writeAuditLog({
    actorId: profile.id,
    action: "task.complete",
    targetTable: "task_records",
    targetId: result.record?.id ?? null,
    detail: {
      residentId,
      taskId,
      alreadyCompleted: result.alreadyCompleted,
      points: result.balanceAfter,
    },
    supabase,
  });

  return NextResponse.json({
    ok: true,
    alreadyCompleted: result.alreadyCompleted,
    points: result.balanceAfter,
  });
}

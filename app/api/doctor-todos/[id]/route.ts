import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/db/audit";
import { updateDoctorTodoStatus } from "@/lib/db/doctorTodos";
import { createTodoStatusEvent } from "@/lib/db/todoStatusEvents";
import { canAccessWorkbench, getServerAuthContext } from "@/lib/supabase/server-auth";
import { DoctorTodoRow } from "@/lib/types";

const allowedStatuses = new Set<DoctorTodoRow["status"]>([
  "pending",
  "processing",
  "done",
  "ignored",
]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置。" }, { status: 401 });
  }

  if (!canAccessWorkbench(profile.role)) {
    return NextResponse.json({ message: "当前角色没有工作台权限。" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as { status?: DoctorTodoRow["status"] };
  const status = body.status;

  if (!status || !allowedStatuses.has(status)) {
    return NextResponse.json({ message: "待办状态不合法。" }, { status: 400 });
  }

  const todoQuery = (await supabase
    .from("doctor_todos")
    .select("id, assigned_to, status")
    .eq("id", id)
    .maybeSingle()) as {
    data: { id: string; assigned_to: string | null; status: DoctorTodoRow["status"] } | null;
  };
  const todo = todoQuery.data;

  if (!todo) {
    return NextResponse.json({ message: "未找到可更新的工单。" }, { status: 404 });
  }

  if (profile.role !== "admin" && todo.assigned_to !== profile.id) {
    return NextResponse.json({ message: "您不能修改这条待办。" }, { status: 403 });
  }

  const result = await updateDoctorTodoStatus(id, status, supabase);

  if (!result.ok || !result.todo) {
    return NextResponse.json({ message: result.message ?? "待办状态更新失败。" }, { status: 400 });
  }

  await writeAuditLog({
    actorId: profile.id,
    action: "doctor_todo.update_status",
    targetTable: "doctor_todos",
    targetId: result.todo.id,
    detail: {
      status,
      legacyRoute: true,
    },
    supabase,
  });

  await createTodoStatusEvent({
    todoId: id,
    actorId: profile.id,
    oldStatus: todo.status,
    newStatus: status,
    note:
      status === "processing"
        ? "家医团队已开始处理。"
        : status === "done"
          ? "家医团队已更新处理结果。"
          : status === "ignored"
            ? "该提醒已关闭。"
            : "该提醒已重新标记为待处理。",
    supabase,
  });

  return NextResponse.json({ ok: true, todo: result.todo });
}

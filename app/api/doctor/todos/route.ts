import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/db/audit";
import {
  createDoctorTodo,
  getDoctorTodosForUser,
  updateDoctorTodoStatus,
} from "@/lib/db/doctorTodos";
import { getActiveFamilyBindingsForResident } from "@/lib/db/familyBindings";
import { createNotification } from "@/lib/db/notifications";
import { createTodoStatusEvent } from "@/lib/db/todoStatusEvents";
import { canAccessWorkbench, getServerAuthContext } from "@/lib/supabase/server-auth";
import type { DoctorTodoRow } from "@/lib/types";

const allowedStatuses = new Set<DoctorTodoRow["status"]>([
  "pending",
  "processing",
  "done",
  "ignored",
]);

export async function GET() {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录" }, { status: 401 });
  }

  if (!canAccessWorkbench(profile.role)) {
    return NextResponse.json({ message: "当前角色没有工作台权限" }, { status: 403 });
  }

  const todos = await getDoctorTodosForUser(profile.id, profile.role, supabase);
  return NextResponse.json({ ok: true, todos });
}

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录" }, { status: 401 });
  }

  if (!canAccessWorkbench(profile.role)) {
    return NextResponse.json({ message: "当前角色没有工作台权限" }, { status: 403 });
  }

  const body = (await request.json()) as {
    residentId?: string | null;
    assignedTo?: string | null;
    type?: string;
    title?: string;
    description?: string | null;
    originalQuestion?: string | null;
    clawAnswer?: string | null;
    riskLevel?: DoctorTodoRow["risk_level"];
    source?: string | null;
  };

  if (!body.title || !body.riskLevel) {
    return NextResponse.json({ message: "待办参数不完整" }, { status: 400 });
  }

  const assignedTo = profile.role === "admin" ? body.assignedTo ?? null : profile.id;
  const result = await createDoctorTodo({
    residentId: body.residentId ?? null,
    assignedTo,
    type: body.type ?? "ask",
    title: body.title,
    description: body.description ?? null,
    originalQuestion: body.originalQuestion ?? null,
    clawAnswer: body.clawAnswer ?? null,
    riskLevel: body.riskLevel,
    source: body.source ?? "manual",
    supabase,
  });

  if (!result.ok || !result.todo) {
    return NextResponse.json({ message: result.message ?? "待办创建失败" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: profile.id,
    action: "doctor_todo.create",
    targetTable: "doctor_todos",
    targetId: result.todo.id,
    detail: {
      residentId: result.todo.resident_id,
      assignedTo: result.todo.assigned_to,
      riskLevel: result.todo.risk_level,
    },
    supabase,
  });

  return NextResponse.json({ ok: true, todo: result.todo });
}

export async function PATCH(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录" }, { status: 401 });
  }

  if (!canAccessWorkbench(profile.role)) {
    return NextResponse.json({ message: "当前角色没有工作台权限" }, { status: 403 });
  }

  const body = (await request.json()) as {
    todoId?: string;
    status?: DoctorTodoRow["status"];
    note?: string;
  };

  const todoId = typeof body.todoId === "string" ? body.todoId : "";
  const status = body.status;
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!todoId || !status || !allowedStatuses.has(status)) {
    return NextResponse.json({ message: "待办状态参数不合法" }, { status: 400 });
  }

  const todoQuery = (await supabase
    .from("doctor_todos")
    .select("id, assigned_to, status")
    .eq("id", todoId)
    .maybeSingle()) as {
    data: { id: string; assigned_to: string | null; status: DoctorTodoRow["status"] } | null;
  };
  const todo = todoQuery.data;

  if (!todo) {
    return NextResponse.json({ message: "未找到待办" }, { status: 404 });
  }

  if (profile.role !== "admin" && todo.assigned_to && todo.assigned_to !== profile.id) {
    return NextResponse.json({ message: "您不能修改这条待办" }, { status: 403 });
  }

  const result = await updateDoctorTodoStatus(
    todoId,
    status,
    supabase,
    profile.role === "admin" ? undefined : (todo.assigned_to ?? profile.id),
  );

  if (!result.ok || !result.todo) {
    return NextResponse.json({ message: result.message ?? "待办状态更新失败" }, { status: 500 });
  }

  await createTodoStatusEvent({
    todoId,
    actorId: profile.id,
    oldStatus: todo.status,
    newStatus: status,
    note:
      note ||
      (status === "processing"
        ? "家医团队已开始处理。"
        : status === "done"
          ? "家医团队已更新处理结果。"
          : status === "ignored"
            ? "该提醒已关闭。"
            : "该提醒已重新标记为待处理。"),
    supabase,
  });

  await writeAuditLog({
    actorId: profile.id,
    action: "doctor_todo.update_status",
    targetTable: "doctor_todos",
    targetId: result.todo.id,
    detail: {
      status,
      assignedTo: result.todo.assigned_to,
    },
    supabase,
  });

  if ((status === "done" || status === "processing") && result.todo.resident_id) {
    try {
      await createNotification(
        {
          userId: result.todo.resident_id,
          actorId: profile.id,
          type: "todo_status_changed",
          title:
            status === "processing"
              ? "家医团队正在处理"
              : "家医团队已更新处理状态",
          content:
            status === "processing"
              ? "您的问题当前状态已更新为“处理中”。"
              : "您的问题当前状态已更新为“已处理”，可前往服务进度查看。",
          linkUrl: "/service-progress",
          metadata: {
            todoId: result.todo.id,
            residentId: result.todo.resident_id,
            status,
          },
        },
        supabase,
      );
    } catch {
      // best effort
    }

    try {
      const bindings = await getActiveFamilyBindingsForResident(result.todo.resident_id, supabase);
      for (const binding of bindings.filter((item) => item.isPrimary)) {
        await createNotification(
          {
            userId: binding.familyId,
            actorId: profile.id,
            type: "todo_status_changed",
            title: "老人服务进度已更新",
            content: "绑定老人的一条家医团队提醒已有新的处理进度。",
            linkUrl: "/family",
            metadata: {
              todoId: result.todo.id,
              residentId: result.todo.resident_id,
              status,
            },
          },
          supabase,
        );
      }
    } catch {
      // best effort
    }
  }

  return NextResponse.json({ ok: true, todo: result.todo });
}

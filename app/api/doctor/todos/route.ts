import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/db/audit";
import {
  createDoctorTodo,
  getDoctorTodosForUser,
  updateDoctorTodoStatus,
} from "@/lib/db/doctorTodos";
import { canAccessWorkbench, getServerAuthContext } from "@/lib/supabase/server-auth";
import { DoctorTodoRow } from "@/lib/types";

const allowedStatuses = new Set<DoctorTodoRow["status"]>([
  "pending",
  "processing",
  "done",
  "ignored",
]);

export async function GET() {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置" }, { status: 401 });
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
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置" }, { status: 401 });
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

  return NextResponse.json({
    ok: true,
    todo: result.todo,
  });
}

export async function PATCH(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置" }, { status: 401 });
  }

  if (!canAccessWorkbench(profile.role)) {
    return NextResponse.json({ message: "当前角色没有工作台权限" }, { status: 403 });
  }

  const body = (await request.json()) as {
    todoId?: string;
    status?: DoctorTodoRow["status"];
  };

  const todoId = typeof body.todoId === "string" ? body.todoId : "";
  const status = body.status;

  if (!todoId || !status || !allowedStatuses.has(status)) {
    return NextResponse.json({ message: "待办状态参数不合法" }, { status: 400 });
  }

  const todoQuery = (await supabase
    .from("doctor_todos")
    .select("id, assigned_to")
    .eq("id", todoId)
    .maybeSingle()) as {
    data: { id: string; assigned_to: string | null } | null;
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

  return NextResponse.json({
    ok: true,
    todo: result.todo,
  });
}

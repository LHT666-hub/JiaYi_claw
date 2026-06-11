import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/db/audit";
import { createDoctorTodo } from "@/lib/db/doctorTodos";
import { createNotification } from "@/lib/db/notifications";
import { completeTask } from "@/lib/db/tasks";
import { createTodoStatusEvent } from "@/lib/db/todoStatusEvents";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

async function findNurseAssigneeId(supabase: NonNullable<Awaited<ReturnType<typeof getServerAuthContext>>["supabase"]>) {
  const { data } = (await supabase
    .from("profiles")
    .select("id")
    .eq("role", "nurse")
    .limit(1)
    .maybeSingle()) as { data: { id: string } | null };

  return data?.id ?? null;
}

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录" }, { status: 401 });
  }

  if (profile.role !== "resident") {
    return NextResponse.json({ message: "当前身份暂不支持提交随访回复" }, { status: 403 });
  }

  const body = (await request.json()) as { response?: string };
  const followupResponse = typeof body.response === "string" ? body.response.trim() : "";

  if (!followupResponse) {
    return NextResponse.json({ message: "缺少随访回复内容" }, { status: 400 });
  }

  const taskResult = await completeTask({
    taskId: "task-followup-confirm",
    residentId: profile.id,
    actorId: profile.id,
    note: followupResponse,
    supabase,
  });

  const nurseId = await findNurseAssigneeId(supabase);
  const todoResult = await createDoctorTodo({
    residentId: profile.id,
    assignedTo: nurseId,
    type: "followup",
    title: `${profile.display_name} 已回复本周随访`,
    description: `居民回复：${followupResponse}`,
    originalQuestion: `${profile.display_name} 的本周随访确认`,
    clawAnswer: followupResponse,
    riskLevel: followupResponse.includes("改一个时间") || followupResponse.includes("联系家属") ? "medium" : "low",
    source: "followup",
    supabase,
  });

  if (todoResult.ok && todoResult.todo) {
    await createTodoStatusEvent({
      todoId: todoResult.todo.id,
      actorId: profile.id,
      oldStatus: null,
      newStatus: "pending",
      note: `居民已回复随访安排：${followupResponse}`,
      supabase,
    });
  }

  await writeAuditLog({
    actorId: profile.id,
    action: "followup.confirm",
    targetTable: "task_records",
    targetId: taskResult.record?.id ?? null,
    detail: {
      residentId: profile.id,
      response: followupResponse,
      taskCompleted: taskResult.ok,
      todoCreated: todoResult.ok,
      todoId: todoResult.todo?.id ?? null,
    },
    supabase,
  });

  try {
    await createNotification(
      {
        userId: profile.id,
        actorId: profile.id,
        type: "todo_status_changed",
        title: "已收到您的随访回复",
        content: "家医团队已收到您的随访确认，后续会按安排继续跟进。",
        linkUrl: "/service-progress",
        metadata: {
          todoId: todoResult.todo?.id ?? null,
          followupResponse,
        },
      },
      supabase,
    );
  } catch {
    // best effort
  }

  return NextResponse.json({
    ok: true,
    response: followupResponse,
    taskCompleted: taskResult.ok,
    alreadyCompleted: taskResult.alreadyCompleted ?? false,
    todoCreated: todoResult.ok,
    todoId: todoResult.todo?.id ?? null,
  });
}

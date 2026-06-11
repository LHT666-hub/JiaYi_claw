import { NextRequest, NextResponse } from "next/server";
import {
  advanceServiceTask,
  buildResidentServiceUpdateCopy,
  encodeDescriptionWithServiceTask,
  normalizeAssignableRole,
  parseDescriptionWithServiceTask,
} from "@/lib/agentTaskPayload";
import { writeAuditLog } from "@/lib/db/audit";
import { getActiveFamilyBindingsForResident } from "@/lib/db/familyBindings";
import { createNotification } from "@/lib/db/notifications";
import { updateDoctorTodoStatus } from "@/lib/db/doctorTodos";
import { createTodoStatusEvent } from "@/lib/db/todoStatusEvents";
import { canAccessWorkbench, getServerAuthContext } from "@/lib/supabase/server-auth";
import { AppRole, DoctorTodoRow } from "@/lib/types";

const allowedStatuses = new Set<DoctorTodoRow["status"]>([
  "pending",
  "processing",
  "done",
  "ignored",
]);

async function findAssignableUserId(
  role: Exclude<AppRole, "resident" | "family" | "admin">,
  supabase: NonNullable<Awaited<ReturnType<typeof getServerAuthContext>>["supabase"]>,
) {
  const { data } = (await supabase
    .from("profiles")
    .select("id")
    .eq("role", role)
    .limit(1)
    .maybeSingle()) as { data: { id: string } | null };

  return data?.id ?? null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或服务暂不可用。" }, { status: 401 });
  }

  if (!canAccessWorkbench(profile.role)) {
    return NextResponse.json({ message: "当前角色没有工作台权限。" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    status?: DoctorTodoRow["status"];
    note?: string;
  };
  const status = body.status;
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!status || !allowedStatuses.has(status)) {
    return NextResponse.json({ message: "待办状态参数不合法。" }, { status: 400 });
  }

  const todoQuery = (await supabase
    .from("doctor_todos")
    .select("id, resident_id, assigned_to, status, description")
    .eq("id", id)
    .maybeSingle()) as {
    data: {
      id: string;
      resident_id: string | null;
      assigned_to: string | null;
      status: DoctorTodoRow["status"];
      description: string | null;
    } | null;
  };
  const todo = todoQuery.data;

  if (!todo) {
    return NextResponse.json({ message: "未找到可更新的工单。" }, { status: 404 });
  }

  if (profile.role !== "admin" && todo.assigned_to && todo.assigned_to !== profile.id) {
    return NextResponse.json({ message: "您不能修改这条待办。" }, { status: 403 });
  }

  const descriptionPayload = parseDescriptionWithServiceTask(todo.description);
  let nextStatus = status;
  let nextAssignedTo: string | null | undefined =
    profile.role === "admin" ? undefined : (todo.assigned_to ?? profile.id);
  let nextDescription: string | null | undefined;
  let statusNote =
    note ||
    (status === "processing"
      ? "家庭医生团队已开始处理。"
      : status === "done"
        ? "家庭医生团队已更新处理结果。"
        : status === "ignored"
          ? "这条服务提醒已关闭。"
          : "这条服务提醒已重新标记为待处理。");

  if (status === "done" && descriptionPayload.serviceTask) {
    const advanced = advanceServiceTask(descriptionPayload.serviceTask);

    if (advanced) {
      nextDescription = encodeDescriptionWithServiceTask(
        descriptionPayload.plainDescription,
        advanced.serviceTask,
      );

      if (advanced.completed) {
        nextStatus = "done";
        statusNote = note || "当前节点已完成，整条服务流程已处理完成。";
      } else {
        nextStatus = "processing";
        const nextRole = normalizeAssignableRole(advanced.nextOwnerRole);
        nextAssignedTo = nextRole ? await findAssignableUserId(nextRole, supabase) : null;
        statusNote = note || `当前节点已完成，已流转至「${advanced.currentStepTitle ?? "下一处理节点"}」。`;
      }
    }
  }

  const result = await updateDoctorTodoStatus(
    id,
    nextStatus,
    supabase,
    nextAssignedTo,
    nextDescription,
  );

  if (!result.ok || !result.todo) {
    return NextResponse.json({ message: result.message ?? "待办状态更新失败。" }, { status: 400 });
  }

  await writeAuditLog({
    actorId: profile.id,
    action: "doctor_todo.update_status",
    targetTable: "doctor_todos",
    targetId: result.todo.id,
    detail: {
      status: nextStatus,
      legacyRoute: true,
      assignedTo: result.todo.assigned_to,
    },
    supabase,
  });

  await createTodoStatusEvent({
    todoId: id,
    actorId: profile.id,
    oldStatus: todo.status,
    newStatus: nextStatus,
    note: statusNote,
    supabase,
  });

  if ((nextStatus === "done" || nextStatus === "processing") && result.todo.resident_id) {
    const latestDescriptionPayload = parseDescriptionWithServiceTask(result.todo.description);
    const residentCopy = buildResidentServiceUpdateCopy(
      latestDescriptionPayload.serviceTask,
      nextStatus,
      nextStatus === "processing"
        ? statusNote
        : "您的服务任务已完成，可以前往服务进度查看。",
    );

    try {
      await createNotification(
        {
          userId: result.todo.resident_id,
          actorId: profile.id,
          type: "todo_status_changed",
          title: residentCopy.title,
          content: residentCopy.content,
          linkUrl: "/service-progress",
          metadata: {
            todoId: result.todo.id,
            residentId: result.todo.resident_id,
            status: nextStatus,
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
            title: "老人服务任务有新进展",
            content: statusNote,
            linkUrl: "/family",
            metadata: {
              todoId: result.todo.id,
              residentId: result.todo.resident_id,
              status: nextStatus,
            },
          },
          supabase,
        );
      }
    } catch {
      // best effort
    }
  }

  if (nextStatus === "processing" && result.todo.assigned_to && result.todo.assigned_to !== profile.id) {
    try {
      await createNotification(
        {
          userId: result.todo.assigned_to,
          actorId: profile.id,
          type: "ask_todo_created",
          title: "收到新的服务流转任务",
          content: statusNote,
          linkUrl: "/doctor",
          metadata: {
            todoId: result.todo.id,
            residentId: result.todo.resident_id,
            status: nextStatus,
          },
        },
        supabase,
      );
    } catch {
      // best effort
    }
  }

  return NextResponse.json({ ok: true, todo: result.todo });
}

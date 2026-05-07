import { addPointsLedger, getResidentPoints } from "@/lib/db/points";
import { TypedSupabaseClient } from "@/lib/supabase/types";
import { SupabaseTaskRow, TaskRecordRow } from "@/lib/types";

type CompleteTaskInput = {
  taskId: string;
  residentId: string;
  actorId?: string | null;
  note?: string | null;
  supabase: TypedSupabaseClient;
};

function getShanghaiToday() {
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export async function getActiveTasks(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, description, category, points, is_active, sort_order, created_at, updated_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load tasks");
  }

  return data as SupabaseTaskRow[];
}

export async function getTaskRecords(
  residentId: string,
  supabase: TypedSupabaseClient,
  completedOn?: string,
) {
  let query = supabase
    .from("task_records")
    .select("id, resident_id, task_id, completed_on, completed_at, points_awarded, note")
    .eq("resident_id", residentId)
    .order("completed_at", { ascending: false });

  if (completedOn) {
    query = query.eq("completed_on", completedOn);
  }

  const { data, error } = await query;

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load task records");
  }

  return data as TaskRecordRow[];
}

export async function completeTask({
  taskId,
  residentId,
  actorId = null,
  note = null,
  supabase,
}: CompleteTaskInput) {
  try {
    const completedOn = getShanghaiToday();
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, title, points")
      .eq("id", taskId)
      .eq("is_active", true)
      .maybeSingle();

    if (taskError || !task) {
      return {
        ok: false,
        alreadyCompleted: false,
        balanceAfter: 0,
        message: "任务不存在或未启用",
      };
    }

    const { data: existing } = await supabase
      .from("task_records")
      .select("id")
      .eq("resident_id", residentId)
      .eq("task_id", taskId)
      .eq("completed_on", completedOn)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const points = await getResidentPoints(residentId, supabase);
      return {
        ok: true,
        alreadyCompleted: true,
        balanceAfter: points.points,
        message: "今天已经完成过这个任务了",
      };
    }

    const { data: insertedRecord, error: recordError } = await supabase
      .from("task_records")
      .insert({
        resident_id: residentId,
        task_id: taskId,
        completed_on: completedOn,
        points_awarded: Number(task.points || 0),
        note,
      })
      .select("id, resident_id, task_id, completed_on, completed_at, points_awarded, note")
      .maybeSingle();

    if (recordError || !insertedRecord) {
      if (recordError?.code === "23505") {
        const points = await getResidentPoints(residentId, supabase);
        return {
          ok: true,
          alreadyCompleted: true,
          balanceAfter: points.points,
          message: "今天已经完成过这个任务了",
        };
      }

      return {
        ok: false,
        alreadyCompleted: false,
        balanceAfter: 0,
        message: recordError?.message ?? "任务完成记录写入失败",
      };
    }

    const ledgerResult = await addPointsLedger({
      residentId,
      change: Number(task.points || 0),
      reason: String(task.title),
      sourceType: "task",
      sourceId: String(task.id),
      createdBy: actorId,
      supabase,
    });

    if (!ledgerResult.ok) {
      return {
        ok: false,
        alreadyCompleted: false,
        balanceAfter: 0,
        message: ledgerResult.message ?? "积分流水写入失败",
      };
    }

    return {
      ok: true,
      alreadyCompleted: false,
      balanceAfter: ledgerResult.balanceAfter,
      record: insertedRecord as TaskRecordRow,
    };
  } catch {
    return {
      ok: false,
      alreadyCompleted: false,
      balanceAfter: 0,
      message: "完成任务失败",
    };
  }
}

import { TypedSupabaseClient } from "@/lib/supabase/types";
import { SupabaseTaskRow, TaskRecordRow } from "@/lib/types";
import { addPointsLedger, getResidentPoints } from "@/lib/db/points";

type CompleteTaskInput = {
  taskId: string;
  residentId: string;
  actorId?: string | null;
  note?: string | null;
  supabase: TypedSupabaseClient;
};

function getTodayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export async function getActiveTasks(supabase: TypedSupabaseClient) {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, description, category, points, is_active, sort_order, created_at, updated_at")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error || !data) {
      return [] as SupabaseTaskRow[];
    }

    return data as SupabaseTaskRow[];
  } catch {
    return [] as SupabaseTaskRow[];
  }
}

export async function getTaskRecords(
  residentId: string,
  supabase: TypedSupabaseClient,
) {
  try {
    const { data, error } = await supabase
      .from("task_records")
      .select("id, resident_id, task_id, completed_at, points_awarded, note")
      .eq("resident_id", residentId)
      .order("completed_at", { ascending: false });

    if (error || !data) {
      return [] as TaskRecordRow[];
    }

    return data as TaskRecordRow[];
  } catch {
    return [] as TaskRecordRow[];
  }
}

export async function completeTask({
  taskId,
  residentId,
  actorId = null,
  note = null,
  supabase,
}: CompleteTaskInput) {
  try {
    const { start, end } = getTodayRange();
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
        message: "任务不存在",
      };
    }

    const { data: existing } = await supabase
      .from("task_records")
      .select("id")
      .eq("resident_id", residentId)
      .eq("task_id", taskId)
      .gte("completed_at", start)
      .lte("completed_at", end)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const points = await getResidentPoints(residentId, supabase);
      return {
        ok: true,
        alreadyCompleted: true,
        balanceAfter: points.points,
      };
    }

    const { data: insertedRecord, error: recordError } = await supabase
      .from("task_records")
      .insert({
        resident_id: residentId,
        task_id: taskId,
        points_awarded: Number(task.points || 0),
        note,
      })
      .select("id, resident_id, task_id, completed_at, points_awarded, note")
      .maybeSingle();

    if (recordError || !insertedRecord) {
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
      reason: `完成任务：${String(task.title)}`,
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
        message: ledgerResult.message ?? "积分同步失败",
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

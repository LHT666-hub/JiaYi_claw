import { TypedSupabaseClient } from "@/lib/supabase/types";
import { TodoStatusEvent } from "@/lib/types";

type TodoStatusEventRow = {
  id: string;
  todo_id: string;
  actor_id: string | null;
  old_status: "pending" | "processing" | "done" | "ignored" | null;
  new_status: "pending" | "processing" | "done" | "ignored";
  note: string | null;
  created_at: string;
  actor?: { display_name?: string | null } | { display_name?: string | null }[] | null;
};

function firstActor(
  actor: TodoStatusEventRow["actor"],
): { display_name?: string | null } | null {
  if (Array.isArray(actor)) {
    return actor[0] ?? null;
  }
  return actor ?? null;
}

export function mapTodoStatusEvent(row: TodoStatusEventRow): TodoStatusEvent {
  const actor = firstActor(row.actor);
  return {
    id: row.id,
    todoId: row.todo_id,
    actorId: row.actor_id,
    actorName: actor?.display_name ?? "",
    oldStatus: row.old_status,
    newStatus: row.new_status,
    note: row.note ?? "",
    createdAt: row.created_at,
  };
}

export async function listTodoStatusEvents(todoIds: string[], supabase: TypedSupabaseClient) {
  if (!todoIds.length) {
    return [] as TodoStatusEvent[];
  }

  const { data, error } = await supabase
    .from("todo_status_events")
    .select("id, todo_id, actor_id, old_status, new_status, note, created_at, actor:profiles(display_name)")
    .in("todo_id", todoIds)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [] as TodoStatusEvent[];
  }

  return (data as TodoStatusEventRow[]).map(mapTodoStatusEvent);
}

export async function createTodoStatusEvent(params: {
  todoId: string;
  actorId?: string | null;
  oldStatus?: TodoStatusEvent["oldStatus"];
  newStatus: TodoStatusEvent["newStatus"];
  note?: string | null;
  supabase: TypedSupabaseClient;
}) {
  const { data, error } = await params.supabase
    .from("todo_status_events")
    .insert({
      todo_id: params.todoId,
      actor_id: params.actorId ?? null,
      old_status: params.oldStatus ?? null,
      new_status: params.newStatus,
      note: params.note ?? null,
    })
    .select("id, todo_id, actor_id, old_status, new_status, note, created_at, actor:profiles(display_name)")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapTodoStatusEvent(data as TodoStatusEventRow);
}

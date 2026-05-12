import { NextRequest, NextResponse } from "next/server";
import { getDoctorTodosForResidents } from "@/lib/db/doctorTodos";
import { listTodoStatusEvents } from "@/lib/db/todoStatusEvents";
import { mapRemoteTodoToProgress } from "@/lib/serviceProgress";
import { getServerAuthContext } from "@/lib/supabase/server-auth";
import { DoctorTodoRow } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ ok: true, todos: [] });
  }

  const requestedResidentId = request.nextUrl.searchParams.get("residentId");
  let residentIds: string[] = [];
  const residentNameMap = new Map<string, string>();

  if (profile.role === "resident") {
    residentIds = [profile.id];
    residentNameMap.set(profile.id, profile.display_name);
  } else if (profile.role === "family") {
    const bindingQuery = await supabase
      .from("family_bindings")
      .select("resident_id, resident:profiles!family_bindings_resident_id_fkey(display_name), status")
      .eq("family_id", profile.id)
      .eq("status", "active");

    const bindingRows = (bindingQuery.data ?? []) as Array<{
      resident_id: string;
      status: string;
      resident?: { display_name?: string | null } | { display_name?: string | null }[] | null;
    }>;

    residentIds = bindingRows.map((item) => item.resident_id);
    for (const row of bindingRows) {
      const resident = Array.isArray(row.resident) ? row.resident[0] : row.resident;
      residentNameMap.set(row.resident_id, resident?.display_name ?? "居民");
    }
  } else if (profile.role === "admin") {
    const residentQuery = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("role", "resident");
    const residents = (residentQuery.data ?? []) as Array<{ id: string; display_name: string }>;
    residentIds = residents.map((item) => item.id);
    for (const resident of residents) {
      residentNameMap.set(resident.id, resident.display_name);
    }
  } else {
    return NextResponse.json({ message: "当前身份暂无服务进度权限" }, { status: 403 });
  }

  if (requestedResidentId && (profile.role === "family" || profile.role === "admin")) {
    residentIds = residentIds.filter((id) => id === requestedResidentId);
  }

  const todos = await getDoctorTodosForResidents(residentIds, supabase);
  const todoIds = todos.map((item) => item.id);
  const statusEvents = await listTodoStatusEvents(todoIds, supabase);
  const eventsByTodoId = new Map<string, typeof statusEvents>();

  for (const event of statusEvents) {
    const current = eventsByTodoId.get(event.todoId) ?? [];
    current.push(event);
    eventsByTodoId.set(event.todoId, current);
  }

  const items = todos.map((todo: DoctorTodoRow) =>
    mapRemoteTodoToProgress({
      todo,
      residentName: residentNameMap.get(todo.resident_id ?? "") ?? "居民",
      statusEvents: eventsByTodoId.get(todo.id) ?? [],
    }),
  );

  return NextResponse.json({ ok: true, todos: items });
}

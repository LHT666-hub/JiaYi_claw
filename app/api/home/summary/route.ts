import { NextRequest, NextResponse } from "next/server";
import { getDoctorTodosForResidents } from "@/lib/db/doctorTodos";
import { getNotifications } from "@/lib/db/notifications";
import { getResidentPointsSummary } from "@/lib/db/points";
import { getTaskRecords } from "@/lib/db/tasks";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

type ResidentHomeSummary = {
  residentId: string;
  residentName: string;
  totalPoints: number;
  completedTaskIdsToday: string[];
  completedTaskCountToday: number;
  pendingTodoCount: number;
  groupCheckInCountToday: number;
  followupConfirmed: boolean;
  followupResponse: string | null;
  followupConfirmedAt: string | null;
};

function getFollowupSummary(notifications: Awaited<ReturnType<typeof getNotifications>>) {
  const followupNotification = notifications.find((item) => {
    const metadata = item.metadata ?? {};
    return (
      item.type === "todo_status_changed" &&
      typeof metadata.followupResponse === "string" &&
      metadata.followupResponse.trim().length > 0
    );
  });

  const followupResponse =
    typeof followupNotification?.metadata?.followupResponse === "string"
      ? followupNotification.metadata.followupResponse
      : null;

  return {
    followupConfirmed: Boolean(followupResponse),
    followupResponse,
    followupConfirmedAt: followupNotification?.created_at ?? null,
  };
}

async function buildResidentSummary(
  residentId: string,
  residentName: string,
  supabase: NonNullable<Awaited<ReturnType<typeof getServerAuthContext>>["supabase"]>,
) {
  const todayKey = taskDateFromNow();
  const [pointsSummary, taskRecords, todos, notifications] = await Promise.all([
    getResidentPointsSummary(residentId, supabase),
    getTaskRecords(residentId, supabase, todayKey),
    getDoctorTodosForResidents([residentId], supabase),
    getNotifications(residentId, supabase, { limit: 100 }),
  ]);

  const todayCompletedTaskIds = [...new Set(taskRecords.map((item) => item.task_id))];
  const pendingTodoCount = todos.filter(
    (todo) => todo.status === "pending" || todo.status === "processing",
  ).length;
  const followupSummary = getFollowupSummary(notifications);

  return {
    residentId,
    residentName,
    totalPoints: pointsSummary.totalPoints,
    completedTaskIdsToday: todayCompletedTaskIds,
    completedTaskCountToday: todayCompletedTaskIds.length,
    pendingTodoCount,
    groupCheckInCountToday: todayCompletedTaskIds.includes("task-group-reply") ? 1 : 0,
    ...followupSummary,
  } satisfies ResidentHomeSummary;
}

export async function GET(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或服务未配置。" }, { status: 401 });
  }

  try {
    if (profile.role === "resident") {
      const summary = await buildResidentSummary(profile.id, profile.display_name, supabase);
      const todayKey = taskDateFromNow();

      const { count } = await supabase
        .from("task_records")
        .select("id", { count: "exact", head: true })
        .eq("task_id", "task-group-reply")
        .eq("completed_on", todayKey);

      return NextResponse.json({
        ok: true,
        summary: {
          ...summary,
          groupCheckInCountToday: count ?? summary.groupCheckInCountToday,
        },
      });
    }

    if (profile.role === "family") {
      const requestedResidentId = request.nextUrl.searchParams.get("residentId");
      const bindingQuery = await supabase
        .from("family_bindings")
        .select("resident_id, resident:profiles!family_bindings_resident_id_fkey(display_name)")
        .eq("family_id", profile.id)
        .eq("status", "active");

      const bindingRows = (bindingQuery.data ?? []) as Array<{
        resident_id: string;
        resident?: { display_name?: string | null } | { display_name?: string | null }[] | null;
      }>;

      const scopedBindings = requestedResidentId
        ? bindingRows.filter((item) => item.resident_id === requestedResidentId)
        : bindingRows;

      const summaries = await Promise.all(
        scopedBindings.map((binding) => {
          const resident = Array.isArray(binding.resident) ? binding.resident[0] : binding.resident;
          return buildResidentSummary(
            binding.resident_id,
            resident?.display_name ?? "居民",
            supabase,
          );
        }),
      );
      const todayKey = taskDateFromNow();

      const { data: groupCheckIns } = await supabase
        .from("task_records")
        .select("resident_id")
        .in(
          "resident_id",
          summaries.map((item) => item.residentId),
        )
        .eq("task_id", "task-group-reply")
        .eq("completed_on", todayKey);

      const groupCheckInMap = new Map<string, number>();
      for (const row of groupCheckIns ?? []) {
        const residentId = String((row as { resident_id?: string }).resident_id ?? "");
        groupCheckInMap.set(residentId, (groupCheckInMap.get(residentId) ?? 0) + 1);
      }

      return NextResponse.json({
        ok: true,
        summaries: summaries.map((summary) => ({
          ...summary,
          groupCheckInCountToday:
            groupCheckInMap.get(summary.residentId) ?? summary.groupCheckInCountToday,
        })),
      });
    }

    return NextResponse.json({ ok: true, summary: null, summaries: [] });
  } catch {
    return NextResponse.json({ message: "首页汇总读取失败。" }, { status: 500 });
  }
}

function taskDateFromNow() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

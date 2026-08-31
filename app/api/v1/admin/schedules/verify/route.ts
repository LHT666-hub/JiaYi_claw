import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { writeAuditLog } from "@/lib/db/audit";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const schema = z.object({ scheduleIds: z.array(z.string().uuid()).min(1).max(200), decision: z.enum(["verified", "cancelled"]), note: z.string().trim().max(500).nullable().default(null) });
export async function POST(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile || !["admin", "community"].includes(auth.profile.role)) return apiError("FORBIDDEN", "没有排班核验权限。", 403, traceId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_SCHEDULE_REVIEW", "排班核验参数无效。", 400, traceId);
  const { data: pendingSchedules, error: pendingError } = await auth.supabase
    .from("practitioner_schedules")
    .select("id,institution_id,department_id,practitioner_id,starts_at,ends_at,source_url,note,practitioner:practitioners(institution_id),department:departments(institution_id)")
    .in("id", parsed.data.scheduleIds)
    .eq("organization_id", auth.profile.organization_id);
  if (pendingError) return apiError("SCHEDULE_VERIFY_FAILED", pendingError.message, 500, traceId);
  if ((pendingSchedules ?? []).length !== parsed.data.scheduleIds.length) return apiError("SCHEDULE_NOT_FOUND", "部分排班不存在或不属于当前机构。", 404, traceId);
  if (parsed.data.decision === "verified") {
    const now = new Date();
    const invalid = (pendingSchedules ?? []).find((schedule) => {
      const practitioner = Array.isArray(schedule.practitioner) ? schedule.practitioner[0] : schedule.practitioner;
      const department = Array.isArray(schedule.department) ? schedule.department[0] : schedule.department;
      return new Date(schedule.ends_at) <= now ||
        (!schedule.practitioner_id && !schedule.department_id) ||
        (schedule.practitioner_id && practitioner?.institution_id !== schedule.institution_id) ||
        (schedule.department_id && department?.institution_id !== schedule.institution_id) ||
        (!schedule.source_url && !schedule.note && !parsed.data.note);
    });
    if (invalid) return apiError("SCHEDULE_VERIFICATION_INCOMPLETE", "排班已过期、未指定医生或科室、机构归属不匹配，或缺少来源/核验说明。", 400, traceId);
  }
  const { data, error } = await auth.supabase.from("practitioner_schedules").update({ status: parsed.data.decision, note: parsed.data.note, verified_at: new Date().toISOString(), verified_by: auth.profile.id }).in("id", parsed.data.scheduleIds).eq("organization_id", auth.profile.organization_id).select("id,status");
  if (error) return apiError("SCHEDULE_VERIFY_FAILED", error.message, 500, traceId);
  await writeAuditLog({ actorId: auth.profile.id, action: `schedule.${parsed.data.decision}`, targetTable: "practitioner_schedules", detail: { traceId, scheduleIds: parsed.data.scheduleIds, note: parsed.data.note }, supabase: auth.supabase });
  return apiOk({ schedules: data ?? [] }, traceId);
}

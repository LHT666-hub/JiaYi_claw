import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const schema = z.object({ scheduleIds: z.array(z.string().uuid()).min(1).max(200), decision: z.enum(["verified", "cancelled"]), note: z.string().trim().max(500).nullable().default(null) });
export async function POST(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile || !["admin", "community"].includes(auth.profile.role)) return apiError("FORBIDDEN", "没有排班核验权限。", 403, traceId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_SCHEDULE_REVIEW", "排班核验参数无效。", 400, traceId);
  const { data, error } = await auth.supabase.from("practitioner_schedules").update({ status: parsed.data.decision, note: parsed.data.note, verified_at: new Date().toISOString(), verified_by: auth.profile.id }).in("id", parsed.data.scheduleIds).eq("organization_id", auth.profile.organization_id).select("id,status");
  return error ? apiError("SCHEDULE_VERIFY_FAILED", error.message, 500, traceId) : apiOk({ schedules: data ?? [] }, traceId);
}

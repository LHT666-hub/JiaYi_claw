import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile || !["admin", "community"].includes(auth.profile.role)) return apiError("FORBIDDEN", "没有排班管理权限。", 403, traceId);
  const [schedules, institutions, departments, practitioners] = await Promise.all([
    auth.supabase.from("practitioner_schedules").select("*,institution:institutions(name),department:departments(name),practitioner:practitioners(name,title)").eq("organization_id", auth.profile.organization_id).gte("ends_at", new Date(Date.now() - 86_400_000).toISOString()).order("starts_at").limit(200),
    auth.supabase.from("institutions").select("id,name,institution_type").eq("organization_id", auth.profile.organization_id).eq("status", "active").order("name"),
    auth.supabase.from("departments").select("id,name,institution_id").eq("active", true).order("name"),
    auth.supabase.from("practitioners").select("id,name,title,institution_id,department_id").eq("organization_id", auth.profile.organization_id).eq("active", true).order("name"),
  ]);
  const error = schedules.error ?? institutions.error ?? departments.error ?? practitioners.error;
  return error ? apiError("SCHEDULE_ADMIN_LOAD_FAILED", error.message, 500, traceId) : apiOk({ schedules: schedules.data ?? [], institutions: institutions.data ?? [], departments: departments.data ?? [], practitioners: practitioners.data ?? [] }, traceId);
}

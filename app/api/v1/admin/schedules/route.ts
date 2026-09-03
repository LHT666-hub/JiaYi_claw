import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { adminShowcaseCareNetwork } from "@/lib/showcase/admin";

export async function GET(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !auth.supabase) return apiOk({ demo: true, schedules: [{ id: "b0000000-0000-4000-8000-000000000001", institution_id: adminShowcaseCareNetwork.institutions[0].id, department_id: null, practitioner_id: adminShowcaseCareNetwork.practitioners[0].id, starts_at: new Date(Date.now() + 86_400_000).toISOString(), ends_at: new Date(Date.now() + 90_000_000).toISOString(), status: "draft", source_url: null, note: "机构负责人待核验（演示）", institution: { name: adminShowcaseCareNetwork.institutions[0].name }, practitioner: { name: "李医生", title: "主治医师" } }], institutions: adminShowcaseCareNetwork.institutions, departments: adminShowcaseCareNetwork.departments, practitioners: adminShowcaseCareNetwork.practitioners }, traceId);
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

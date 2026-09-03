import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { writeAuditLog } from "@/lib/db/audit";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { demoMutation } from "@/lib/showcase/admin";

const row = z.object({ institutionId: z.string().uuid(), departmentId: z.string().uuid().nullable().optional(), practitionerId: z.string().uuid().nullable().optional(), startsAt: z.string().datetime(), endsAt: z.string().datetime(), serviceMode: z.enum(["clinic", "phone", "home_visit", "online"]).default("clinic"), location: z.string().trim().max(200).nullable().optional(), registrationUrl: z.string().url().nullable().optional(), sourceUrl: z.string().url().nullable().optional(), note: z.string().trim().max(500).nullable().optional() }).superRefine((value, context) => {
  if (new Date(value.endsAt) <= new Date(value.startsAt)) context.addIssue({ code: "custom", path: ["endsAt"], message: "结束时间必须晚于开始时间。" });
  if (!value.departmentId && !value.practitionerId) context.addIssue({ code: "custom", path: ["departmentId"], message: "排班必须指定医生或科室。" });
});
const schema = z.object({ schedules: z.array(row).min(1).max(200) });

export async function POST(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !auth.supabase) return apiOk(demoMutation({ schedules: [{ id: crypto.randomUUID(), status: "draft" }], requiresVerification: true }), traceId, 201);
  if (!auth.supabase || !auth.profile || !["admin", "community"].includes(auth.profile.role)) return apiError("FORBIDDEN", "没有排班导入权限。", 403, traceId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_SCHEDULE_IMPORT", parsed.error.issues[0]?.message ?? "排班格式无效。", 400, traceId);
  const institutionIds = [...new Set(parsed.data.schedules.map((item) => item.institutionId))];
  const { data: institutions } = await auth.supabase.from("institutions").select("id").eq("organization_id", auth.profile.organization_id).in("id", institutionIds);
  if ((institutions ?? []).length !== institutionIds.length) return apiError("INSTITUTION_SCOPE_FORBIDDEN", "排班包含当前机构无权管理的医院。", 403, traceId);
  const practitionerIds = [...new Set(parsed.data.schedules.map((item) => item.practitionerId).filter((value): value is string => Boolean(value)))];
  if (practitionerIds.length) {
    const { data: practitioners } = await auth.supabase.from("practitioners").select("id,institution_id").eq("organization_id", auth.profile.organization_id).in("id", practitionerIds);
    const practitionerMap = new Map((practitioners ?? []).map((item) => [item.id, item.institution_id]));
    if (parsed.data.schedules.some((item) => item.practitionerId && practitionerMap.get(item.practitionerId) !== item.institutionId)) {
      return apiError("PRACTITIONER_SCOPE_FORBIDDEN", "医生与排班机构不匹配。", 403, traceId);
    }
  }
  const departmentIds = [...new Set(parsed.data.schedules.map((item) => item.departmentId).filter((value): value is string => Boolean(value)))];
  if (departmentIds.length) {
    const { data: departments } = await auth.supabase.from("departments").select("id,institution_id").in("id", departmentIds);
    const departmentMap = new Map((departments ?? []).map((item) => [item.id, item.institution_id]));
    if (parsed.data.schedules.some((item) => item.departmentId && departmentMap.get(item.departmentId) !== item.institutionId)) {
      return apiError("DEPARTMENT_SCOPE_FORBIDDEN", "科室与排班机构不匹配。", 403, traceId);
    }
  }
  const records = parsed.data.schedules.map((item) => ({ organization_id: auth.profile!.organization_id, institution_id: item.institutionId, department_id: item.departmentId ?? null, practitioner_id: item.practitionerId ?? null, starts_at: item.startsAt, ends_at: item.endsAt, service_mode: item.serviceMode, location: item.location ?? null, registration_url: item.registrationUrl ?? null, source_url: item.sourceUrl ?? null, source_type: "structured_import", note: item.note ?? null, status: "draft" }));
  const { data, error } = await auth.supabase.from("practitioner_schedules").insert(records).select("*");
  if (error) return apiError("SCHEDULE_IMPORT_FAILED", error.message, 500, traceId);
  await writeAuditLog({ actorId: auth.profile.id, action: "schedule.imported", targetTable: "practitioner_schedules", detail: { traceId, count: data?.length ?? 0 }, supabase: auth.supabase });
  return apiOk({ schedules: data ?? [], requiresVerification: true }, traceId, 201);
}

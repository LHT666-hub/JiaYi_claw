import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const row = z.object({ institutionId: z.string().uuid(), departmentId: z.string().uuid().nullable().optional(), practitionerId: z.string().uuid().nullable().optional(), startsAt: z.string().datetime(), endsAt: z.string().datetime(), serviceMode: z.enum(["clinic", "phone", "home_visit", "online"]).default("clinic"), location: z.string().trim().max(200).nullable().optional(), registrationUrl: z.string().url().nullable().optional(), sourceUrl: z.string().url().nullable().optional(), note: z.string().trim().max(500).nullable().optional() });
const schema = z.object({ schedules: z.array(row).min(1).max(200) });

export async function POST(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile || !["admin", "community"].includes(auth.profile.role)) return apiError("FORBIDDEN", "没有排班导入权限。", 403, traceId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_SCHEDULE_IMPORT", parsed.error.issues[0]?.message ?? "排班格式无效。", 400, traceId);
  const institutionIds = [...new Set(parsed.data.schedules.map((item) => item.institutionId))];
  const { data: institutions } = await auth.supabase.from("institutions").select("id").eq("organization_id", auth.profile.organization_id).in("id", institutionIds);
  if ((institutions ?? []).length !== institutionIds.length) return apiError("INSTITUTION_SCOPE_FORBIDDEN", "排班包含当前机构无权管理的医院。", 403, traceId);
  const records = parsed.data.schedules.map((item) => ({ organization_id: auth.profile!.organization_id, institution_id: item.institutionId, department_id: item.departmentId ?? null, practitioner_id: item.practitionerId ?? null, starts_at: item.startsAt, ends_at: item.endsAt, service_mode: item.serviceMode, location: item.location ?? null, registration_url: item.registrationUrl ?? null, source_url: item.sourceUrl ?? null, source_type: "structured_import", note: item.note ?? null, status: "draft" }));
  const { data, error } = await auth.supabase.from("practitioner_schedules").insert(records).select("*");
  return error ? apiError("SCHEDULE_IMPORT_FAILED", error.message, 500, traceId) : apiOk({ schedules: data ?? [], requiresVerification: true }, traceId, 201);
}

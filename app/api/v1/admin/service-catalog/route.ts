import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const schema = z.object({
  id: z.string().uuid().optional(),
  serviceType: z.enum(["clinic_registration", "family_doctor_booking", "refill_request", "dispense_status_query", "followup_reminder", "report_explanation", "referral_assistance", "other"]),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  ownerRole: z.enum(["doctor", "nurse", "pharmacist", "community"]),
  requiredFields: z.array(z.string().min(1).max(60)).max(30).default([]),
  serviceHours: z.string().trim().max(200).nullable().optional(),
  accessMode: z.enum(["team_assisted", "official_link", "hybrid", "information_only"]).default("team_assisted"),
  officialUrl: z.string().url().nullable().optional(),
  responseSlaHours: z.number().int().min(1).max(720).nullable().optional(),
  availabilityNote: z.string().trim().max(300).nullable().optional(),
  active: z.boolean().default(true),
}).superRefine((value, context) => {
  if (["official_link", "hybrid"].includes(value.accessMode) && !value.officialUrl) {
    context.addIssue({ code: "custom", path: ["officialUrl"], message: "官方跳转或混合模式必须填写官方入口。" });
  }
});

async function requireAdmin(request: NextRequest) { const auth = await getApiAuthContext(request); return auth.profile?.role === "admin" ? auth : null; }

export async function GET(request: NextRequest) {
  const traceId = createTraceId(); const auth = await requireAdmin(request);
  if (!auth?.supabase || !auth.profile) return apiError("FORBIDDEN", "只有管理员可以管理服务目录。", 403, traceId);
  const { data, error } = await auth.supabase.from("service_catalog").select("*").eq("organization_id", auth.profile.organization_id).order("name");
  return error ? apiError("SERVICE_CATALOG_LIST_FAILED", error.message, 500, traceId) : apiOk({ items: data ?? [] }, traceId);
}

async function save(request: NextRequest, update: boolean) {
  const traceId = createTraceId(); const auth = await requireAdmin(request);
  if (!auth?.supabase || !auth.profile?.organization_id) return apiError("FORBIDDEN", "只有管理员可以管理服务目录。", 403, traceId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_SERVICE", parsed.error.issues[0]?.message ?? "服务信息不完整。", 400, traceId);
  const record = { organization_id: auth.profile.organization_id, community_id: auth.profile.community_id, service_type: parsed.data.serviceType, name: parsed.data.name, description: parsed.data.description ?? null, owner_role: parsed.data.ownerRole, required_fields: parsed.data.requiredFields, service_hours: parsed.data.serviceHours ?? null, access_mode: parsed.data.accessMode, official_url: parsed.data.officialUrl ?? null, response_sla_hours: parsed.data.responseSlaHours ?? null, availability_note: parsed.data.availabilityNote ?? null, active: parsed.data.active };
  const query = update && parsed.data.id
    ? auth.supabase.from("service_catalog").update(record).eq("id", parsed.data.id).eq("organization_id", auth.profile.organization_id)
    : auth.supabase.from("service_catalog").upsert(record, { onConflict: "organization_id,community_id,service_type" });
  const { data, error } = await query.select("*").single();
  if (error) return apiError("SERVICE_CATALOG_SAVE_FAILED", error.message, 500, traceId);
  return apiOk({ item: data }, traceId, update ? 200 : 201);
}
export async function POST(request: NextRequest) { return save(request, false); }
export async function PATCH(request: NextRequest) { return save(request, true); }

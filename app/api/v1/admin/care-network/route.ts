import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const schema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("institution"), name: z.string().trim().min(2).max(160), shortName: z.string().trim().max(80).nullable().optional(), institutionType: z.enum(["community", "secondary", "tertiary", "public_service"]), levelLabel: z.string().trim().max(80).nullable().optional(), address: z.string().trim().max(300).nullable().optional(), servicePhone: z.string().trim().max(30).nullable().optional(), officialUrl: z.string().url().nullable().optional(), registrationUrl: z.string().url().nullable().optional(), sourceUrl: z.string().url().nullable().optional(), networkRole: z.enum(["primary_care", "referral", "specialty_support", "public_service"]).default("referral") }),
  z.object({ entity: z.literal("department"), institutionId: z.string().uuid(), name: z.string().trim().min(2).max(100), specialties: z.array(z.string().trim().min(1).max(60)).max(30).default([]), officialUrl: z.string().url().nullable().optional() }),
  z.object({ entity: z.literal("practitioner"), institutionId: z.string().uuid(), departmentId: z.string().uuid().nullable().optional(), name: z.string().trim().min(2).max(80), title: z.string().trim().max(80).nullable().optional(), specialties: z.array(z.string().trim().min(1).max(60)).max(30).default([]), introduction: z.string().trim().max(1000).nullable().optional(), sourceUrl: z.string().url().nullable().optional() }),
  z.object({ entity: z.literal("referralRoute"), careNetworkId: z.string().uuid(), fromInstitutionId: z.string().uuid(), toInstitutionId: z.string().uuid(), toDepartmentId: z.string().uuid().nullable().optional(), name: z.string().trim().min(2).max(160), problemTags: z.array(z.string().trim().min(1).max(60)).max(30).default([]), instructions: z.string().trim().max(1200).nullable().optional(), officialUrl: z.string().url().nullable().optional() }),
]);

async function requireAdmin(request: NextRequest) { const auth = await getApiAuthContext(request); return auth.profile?.role === "admin" ? auth : null; }
export async function GET(request: NextRequest) {
  const traceId = createTraceId(); const auth = await requireAdmin(request);
  if (!auth?.supabase || !auth.profile) return apiError("FORBIDDEN", "只有管理员可以配置医疗网络。", 403, traceId);
  const org = auth.profile.organization_id;
  const [networks, institutions, departments, practitioners, routes] = await Promise.all([
    auth.supabase.from("care_networks").select("*").eq("organization_id", org).order("created_at"),
    auth.supabase.from("institutions").select("*,network_membership:care_network_institutions(care_network_id,network_role,active)").eq("organization_id", org).order("institution_type").order("name"),
    auth.supabase.from("departments").select("*,institution:institutions!inner(name,organization_id)").eq("institution.organization_id", org).order("name"),
    auth.supabase.from("practitioners").select("*,institution:institutions(name),department:departments(name)").eq("organization_id", org).order("name"),
    auth.supabase.from("referral_routes").select("*,from_institution:institutions!referral_routes_from_institution_id_fkey(name),to_institution:institutions!referral_routes_to_institution_id_fkey(name),to_department:departments(name)").eq("organization_id", org).order("name"),
  ]);
  const error = networks.error ?? institutions.error ?? departments.error ?? practitioners.error ?? routes.error;
  return error ? apiError("CARE_NETWORK_ADMIN_FAILED", error.message, 500, traceId) : apiOk({ networks: networks.data ?? [], institutions: institutions.data ?? [], departments: departments.data ?? [], practitioners: practitioners.data ?? [], referralRoutes: routes.data ?? [] }, traceId);
}
export async function POST(request: NextRequest) {
  const traceId = createTraceId(); const auth = await requireAdmin(request);
  if (!auth?.supabase || !auth.profile?.organization_id) return apiError("FORBIDDEN", "只有管理员可以配置医疗网络。", 403, traceId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_CARE_NETWORK_ENTITY", parsed.error.issues[0]?.message ?? "配置无效。", 400, traceId);
  try {
    if (parsed.data.entity === "institution") {
      const { data, error } = await auth.supabase.from("institutions").upsert({ organization_id: auth.profile.organization_id, name: parsed.data.name, short_name: parsed.data.shortName ?? null, institution_type: parsed.data.institutionType, level_label: parsed.data.levelLabel ?? null, address: parsed.data.address ?? null, service_phone: parsed.data.servicePhone ?? null, official_url: parsed.data.officialUrl ?? null, registration_url: parsed.data.registrationUrl ?? null, source_url: parsed.data.sourceUrl ?? null, verified_at: new Date().toISOString(), verified_by: auth.profile.id }, { onConflict: "organization_id,name" }).select("*").single();
      if (error) throw error;
      const { data: network } = await auth.supabase.from("care_networks").select("id").eq("organization_id", auth.profile.organization_id).eq("community_id", auth.profile.community_id).eq("status", "active").limit(1).maybeSingle();
      if (network) await auth.supabase.from("care_network_institutions").upsert({ care_network_id: network.id, institution_id: data.id, network_role: parsed.data.networkRole, active: true }, { onConflict: "care_network_id,institution_id" });
      return apiOk({ institution: data }, traceId, 201);
    }
    const { data: institution } = "institutionId" in parsed.data ? await auth.supabase.from("institutions").select("id").eq("id", parsed.data.institutionId).eq("organization_id", auth.profile.organization_id).maybeSingle() : { data: null };
    if ("institutionId" in parsed.data && !institution) return apiError("INSTITUTION_SCOPE_FORBIDDEN", "机构不属于当前组织。", 403, traceId);
    if (parsed.data.entity === "department") {
      const { data, error } = await auth.supabase.from("departments").upsert({ institution_id: parsed.data.institutionId, name: parsed.data.name, specialties: parsed.data.specialties, official_url: parsed.data.officialUrl ?? null }, { onConflict: "institution_id,name" }).select("*").single(); if (error) throw error; return apiOk({ department: data }, traceId, 201);
    }
    if (parsed.data.entity === "practitioner") {
      const { data, error } = await auth.supabase.from("practitioners").insert({ organization_id: auth.profile.organization_id, institution_id: parsed.data.institutionId, department_id: parsed.data.departmentId ?? null, name: parsed.data.name, title: parsed.data.title ?? null, specialties: parsed.data.specialties, introduction: parsed.data.introduction ?? null, source_url: parsed.data.sourceUrl ?? null, verified_at: new Date().toISOString(), verified_by: auth.profile.id }).select("*").single(); if (error) throw error; return apiOk({ practitioner: data }, traceId, 201);
    }
    const { data: network } = await auth.supabase.from("care_networks").select("id").eq("id", parsed.data.careNetworkId).eq("organization_id", auth.profile.organization_id).maybeSingle();
    const { data: endpoints } = await auth.supabase.from("institutions").select("id").eq("organization_id", auth.profile.organization_id).in("id", [parsed.data.fromInstitutionId, parsed.data.toInstitutionId]);
    if (!network || endpoints?.length !== 2) return apiError("REFERRAL_SCOPE_FORBIDDEN", "转诊路线包含无权管理的机构。", 403, traceId);
    const { data, error } = await auth.supabase.from("referral_routes").insert({ organization_id: auth.profile.organization_id, care_network_id: network.id, from_institution_id: parsed.data.fromInstitutionId, to_institution_id: parsed.data.toInstitutionId, to_department_id: parsed.data.toDepartmentId ?? null, name: parsed.data.name, problem_tags: parsed.data.problemTags, instructions: parsed.data.instructions ?? null, official_url: parsed.data.officialUrl ?? null, reviewed_at: new Date().toISOString(), reviewed_by: auth.profile.id }).select("*").single(); if (error) throw error; return apiOk({ referralRoute: data }, traceId, 201);
  } catch (error) { return apiError("CARE_NETWORK_SAVE_FAILED", error instanceof Error ? error.message : "保存失败。", 500, traceId); }
}

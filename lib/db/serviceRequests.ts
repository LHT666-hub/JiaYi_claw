import type {
  AppointmentIntake,
  ServiceRequestActionInput,
  ServiceRequestCreateInput,
  ServiceStatus,
  ServiceType,
} from "@jiayi/contracts";
import { buildClinicianBrief } from "@/lib/skills/clinicalBrief";
import { extractMedicalEntities } from "@/lib/skills/medicalEntityExtractor";
import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { ProfileRow } from "@/lib/types";

export type ServiceRequestRow = {
  id: string;
  organization_id: string;
  community_id: string | null;
  resident_id: string;
  requested_by: string;
  service_type: ServiceType;
  title: string;
  summary: string;
  priority: "low" | "medium" | "high" | "emergency";
  status: ServiceStatus;
  assigned_role: "doctor" | "nurse" | "pharmacist" | "community" | null;
  assigned_to: string | null;
  payload: Record<string, unknown>;
  idempotency_key: string;
  source: string;
  created_at: string;
  updated_at: string;
  appointment_details?: Record<string, unknown> | Record<string, unknown>[] | null;
  service_request_events?: Array<Record<string, unknown>>;
};

async function resolveTenant(profile: ProfileRow, supabase: TypedSupabaseClient) {
  if (profile.organization_id) {
    return { organizationId: profile.organization_id, communityId: profile.community_id ?? null };
  }

  const { data: community } = await supabase
    .from("communities")
    .select("id, organization_id")
    .eq("slug", "haiwan-town")
    .maybeSingle();

  if (!community) throw new Error("TENANT_NOT_CONFIGURED");
  return { organizationId: community.organization_id as string, communityId: community.id as string };
}

async function resolveResidentId(
  requestedResidentId: string | undefined,
  profile: ProfileRow,
  supabase: TypedSupabaseClient,
) {
  if (profile.role === "resident") return profile.id;
  if (profile.role !== "family") throw new Error("SERVICE_REQUEST_ROLE_FORBIDDEN");

  if (!requestedResidentId) {
    const { data: primaryBinding, error } = await supabase
      .from("family_bindings")
      .select("resident_id")
      .eq("family_id", profile.id)
      .eq("status", "active")
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!primaryBinding?.resident_id) throw new Error("BOUND_RESIDENT_REQUIRED");
    return primaryBinding.resident_id as string;
  }

  const { data: binding } = await supabase
    .from("family_bindings")
    .select("id")
    .eq("family_id", profile.id)
    .eq("resident_id", requestedResidentId)
    .eq("status", "active")
    .maybeSingle();
  if (!binding) throw new Error("RESIDENT_SCOPE_FORBIDDEN");
  return requestedResidentId;
}

async function resolveResidentTenant(
  residentId: string,
  supabase: TypedSupabaseClient,
) {
  const { data: resident, error } = await supabase
    .from("profiles")
    .select("organization_id,community_id")
    .eq("id", residentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!resident?.organization_id) throw new Error("RESIDENT_TENANT_NOT_CONFIGURED");
  return {
    organizationId: resident.organization_id as string,
    communityId: (resident.community_id as string | null) ?? null,
  };
}

async function findExistingByIdempotency(
  requestedBy: string,
  idempotencyKey: string,
  supabase: TypedSupabaseClient,
) {
  const { data } = await supabase
    .from("service_requests")
    .select("*, appointment_details(*), service_request_events(*)")
    .eq("requested_by", requestedBy)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  return (data as ServiceRequestRow | null) ?? null;
}

export async function createServiceRequest(params: {
  input: ServiceRequestCreateInput;
  idempotencyKey: string;
  profile: ProfileRow;
  supabase: TypedSupabaseClient;
  traceId: string;
}) {
  const { input, idempotencyKey, profile, supabase, traceId } = params;
  const residentId = await resolveResidentId(input.residentId, profile, supabase);
  const tenant = profile.role === "family"
    ? await resolveResidentTenant(residentId, supabase)
    : await resolveTenant(profile, supabase);
  const existing = await findExistingByIdempotency(profile.id, idempotencyKey, supabase);
  if (existing) return { request: existing, deduplicated: true };

  const payload: Record<string, unknown> = {};
  if (input.appointment) payload.appointment = input.appointment;

  const { data: requestRow, error: requestError } = await supabase
    .from("service_requests")
    .insert({
      organization_id: tenant.organizationId,
      community_id: tenant.communityId,
      resident_id: residentId,
      requested_by: profile.id,
      service_type: input.serviceType,
      title: input.title,
      summary: input.summary,
      priority: input.priority,
      status: "draft",
      assigned_role: input.requestedRole ?? null,
      payload,
      idempotency_key: idempotencyKey,
      source: "app",
    })
    .select("*")
    .single();

  if (requestError || !requestRow) {
    if (requestError?.code === "23505") {
      const duplicate = await findExistingByIdempotency(profile.id, idempotencyKey, supabase);
      if (duplicate) return { request: duplicate, deduplicated: true };
    }
    throw new Error(requestError?.message ?? "SERVICE_REQUEST_CREATE_FAILED");
  }

  if (input.appointment) {
    const appointment = input.appointment as AppointmentIntake;
    const { error } = await supabase.from("appointment_details").insert({
      service_request_id: requestRow.id,
      target: appointment.target,
      department: appointment.department,
      preferred_doctor: appointment.preferredDoctor,
      preferred_dates: appointment.preferredDates,
      preferred_time: appointment.preferredTime,
      contact_phone: appointment.contactPhone,
      accept_waitlist: appointment.acceptWaitlist,
    });
    if (error) throw new Error(error.message);
  }

  const { data: submitted, error: transitionError } = await supabase.rpc(
    "transition_service_request",
    { p_request_id: requestRow.id, p_action: "submit", p_note: "居民已确认并提交服务申请。", p_details: {} },
  );
  if (transitionError) throw new Error(transitionError.message);

  const entities = extractMedicalEntities(input.summary);
  const brief = buildClinicianBrief({
    residentName: profile.role === "resident" ? profile.display_name : "绑定居民",
    question: input.summary,
    entities,
    appointment: input.appointment,
  });

  const { error: intakeError } = await supabase.rpc("finalize_service_request_intake", {
    p_request_id: requestRow.id,
    p_answers: payload,
    p_entities: entities,
    p_missing_information: entities.missingInformation,
    p_summary: brief.summary,
    p_structured_content: brief.structuredContent,
    p_source_refs: brief.sourceRefs,
    p_skill_id: "clinician-previsit-summary",
    p_skill_version: "1.0.0-cn.1",
    p_trace_id: traceId,
  });
  if (intakeError) throw new Error(intakeError.message);

  const hydrated = await getServiceRequest(requestRow.id, supabase);
  return { request: hydrated ?? (submitted as ServiceRequestRow), deduplicated: false };
}

export async function getServiceRequest(id: string, supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("service_requests")
    .select("*, appointment_details(*), service_request_events(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ServiceRequestRow | null) ?? null;
}

export async function listServiceRequests(
  supabase: TypedSupabaseClient,
  limit = 50,
  residentId?: string,
) {
  let query = supabase
    .from("service_requests")
    .select("*, appointment_details(*), service_request_events(*)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (residentId) query = query.eq("resident_id", residentId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceRequestRow[];
}

export async function listStaffWorkQueue(profile: ProfileRow, supabase: TypedSupabaseClient) {
  let query = supabase
    .from("service_requests")
    .select("*, appointment_details(*), service_request_events(*), resident:profiles!service_requests_resident_id_fkey(id, display_name, phone), assignee:profiles!service_requests_assigned_to_fkey(id, display_name, role)")
    .not("status", "in", "(failed,completed,cancelled)")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(100);
  if (profile.organization_id) query = query.eq("organization_id", profile.organization_id);
  if (profile.community_id) query = query.eq("community_id", profile.community_id);
  if (profile.role !== "admin" && profile.role !== "doctor") {
    query = query.or(`assigned_role.eq.${profile.role},assigned_role.is.null`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function actionServiceRequest(params: {
  id: string;
  input: ServiceRequestActionInput;
  supabase: TypedSupabaseClient;
}) {
  const { id, input, supabase } = params;
  const { data, error } = await supabase.rpc("transition_service_request", {
    p_request_id: id,
    p_action: input.action,
    p_note: input.note,
    p_details: {
      scheduledAt: input.scheduledAt,
      institutionName: input.institutionName,
      departmentName: input.departmentName,
      clinicianName: input.clinicianName,
      bookingReference: input.bookingReference,
    },
  });
  if (error) throw new Error(error.message);
  return (await getServiceRequest(id, supabase)) ?? (data as ServiceRequestRow);
}

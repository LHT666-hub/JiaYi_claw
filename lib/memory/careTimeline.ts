import type { TypedSupabaseClient } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Care Timeline — projection of service_requests + events + appointments
// Does NOT copy data; reads directly from business tables.
// Ordered by date descending.
// ---------------------------------------------------------------------------

export interface CareTimelineEvent {
  date: string;
  event: string;
  status: string;
  serviceRequestId?: string;
  type: string; // '体检' | '报告' | '预约' | '随访' | '服务请求' | etc.
}

function serviceTypeToLabel(serviceType: string): string {
  switch (serviceType) {
    case "clinic_registration":
      return "挂号";
    case "refill_request":
      return "续方配药";
    case "family_doctor_booking":
      return "家医预约";
    case "followup":
      return "随访";
    case "referral_assistance":
      return "转诊";
    case "dispense_status":
      return "配药进度";
    default:
      return "服务请求";
  }
}

export async function getCareTimeline(
  supabase: TypedSupabaseClient,
  residentId: string,
  organizationId: string,
  options?: { limit?: number; months?: number },
): Promise<CareTimelineEvent[]> {
  const limit = options?.limit ?? 50;
  const months = options?.months ?? 6;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffIso = cutoff.toISOString();

  const events: CareTimelineEvent[] = [];

  // 1. Fetch service requests ONCE — reused by steps 2 and 3.
  let requestIds: string[] = [];
  try {
    const { data: requests, error: reqError } = await supabase
      .from("service_requests")
      .select("id, service_type, title, status, created_at, updated_at")
      .eq("resident_id", residentId)
      .eq("organization_id", organizationId)
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!reqError && requests) {
      requestIds = requests.map((r) => r.id);
      for (const r of requests) {
        events.push({
          date: r.created_at,
          event: r.title || serviceTypeToLabel(r.service_type),
          status: r.status,
          serviceRequestId: r.id,
          type: serviceTypeToLabel(r.service_type),
        });
      }
    }
  } catch {
    // Graceful degradation
  }

  // 2. Fetch service_request_events for status transitions (reuses requestIds).
  if (requestIds.length > 0) {
    try {
      const { data: sreEvents, error: sreError } = await supabase
        .from("service_request_events")
        .select("id, service_request_id, action, note, created_at")
        .in("service_request_id", requestIds)
        .gte("created_at", cutoffIso)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!sreError && sreEvents) {
        for (const e of sreEvents) {
          events.push({
            date: e.created_at,
            event: e.note ?? `状态变更: ${e.action}`,
            status: e.action,
            serviceRequestId: e.service_request_id,
            type: "服务事件",
          });
        }
      }
    } catch {
      // Graceful degradation
    }
  }

  // 3. Fetch appointment details (reuses requestIds).
  if (requestIds.length > 0) {
    try {
      const { data: appts, error: apptError } = await supabase
        .from("appointment_details")
        .select("id, service_request_id, target, department, preferred_time, created_at")
        .in("service_request_id", requestIds)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!apptError && appts) {
        for (const a of appts) {
          const target = a.target ?? a.department ?? "门诊";
          events.push({
            date: a.created_at,
            event: `预约: ${target}${a.preferred_time ? ` (${a.preferred_time})` : ""}`,
            status: "booked",
            serviceRequestId: a.service_request_id,
            type: "预约",
          });
        }
      }
    } catch {
      // Graceful degradation
    }
  }

  // Sort by date descending and limit
  events.sort((a, b) => (a.date < b.date ? 1 : -1));
  return events.slice(0, limit);
}

// ---------------------------------------------------------------------------
// buildCareTimeline — convenience wrapper used by API routes
// ---------------------------------------------------------------------------

export async function buildCareTimeline(params: {
  residentId: string;
  supabase: TypedSupabaseClient;
  organizationId?: string;
  limit?: number;
  months?: number;
}): Promise<CareTimelineEvent[]> {
  // If organizationId not provided, resolve from profile
  let orgId = params.organizationId ?? "";
  if (!orgId) {
    try {
      const { data: profile } = await params.supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", params.residentId)
        .maybeSingle();
      orgId = (profile?.organization_id as string) ?? "";
    } catch {
      // Graceful
    }
  }
  return getCareTimeline(params.supabase, params.residentId, orgId, {
    limit: params.limit,
    months: params.months,
  });
}

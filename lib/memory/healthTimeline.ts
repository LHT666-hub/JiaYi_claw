import type { TypedSupabaseClient } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Health Timeline — union projection of resident_memories + health_observations
// Ordered by occurred_at descending.
// ---------------------------------------------------------------------------

export interface HealthTimelineEvent {
  date: string;
  event: string;
  source: "self_reported" | "user_uploaded" | "staff_observed" | "clinician_verified" | "system";
  type: "symptom" | "observation" | "medication" | "lifestyle" | "other";
  memoryId?: string;
  observationId?: string;
}

function memoryTypeToTimelineType(
  memoryType: string,
): HealthTimelineEvent["type"] {
  switch (memoryType) {
    case "symptom_report":
      return "symptom";
    case "medication_statement":
      return "medication";
    case "lifestyle":
      return "lifestyle";
    case "allergy_self_reported":
    case "daily_living":
    case "care_preference":
    case "health_experience":
    default:
      return "other";
  }
}

function formatMemoryEvent(content: Record<string, unknown>, memoryType: string): string {
  // Build a short human-readable description from structured content
  const parts: string[] = [];
  if (content.symptom) parts.push(String(content.symptom));
  if (content.allergen) parts.push(`过敏: ${content.allergen}`);
  if (content.action) parts.push(String(content.action));
  if (content.activity) parts.push(String(content.activity));
  if (content.note) parts.push(String(content.note));
  if (parts.length === 0) parts.push(memoryType.replace(/_/g, " "));
  return parts.join("；");
}

export async function getHealthTimeline(
  supabase: TypedSupabaseClient,
  residentId: string,
  options?: { limit?: number; months?: number },
): Promise<HealthTimelineEvent[]> {
  const limit = options?.limit ?? 50;
  const months = options?.months ?? 6;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffIso = cutoff.toISOString();

  const events: HealthTimelineEvent[] = [];

  // 1. Fetch confirmed resident_memories
  try {
    const { data: memories, error: memError } = await supabase
      .from("resident_memories")
      .select("id, memory_type, content, evidence_level, occurred_at, created_at")
      .eq("resident_id", residentId)
      .eq("is_active", true)
      .in("confirmation_status", ["user_confirmed", "staff_confirmed"])
      .gte("created_at", cutoffIso)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (!memError && memories) {
      for (const m of memories) {
        events.push({
          date: m.occurred_at ?? m.created_at,
          event: formatMemoryEvent(m.content as Record<string, unknown>, m.memory_type),
          source: (m.evidence_level as HealthTimelineEvent["source"]) ?? "self_reported",
          type: memoryTypeToTimelineType(m.memory_type),
          memoryId: m.id,
        });
      }
    }
  } catch {
    // Graceful degradation
  }

  // 2. Fetch health_observations (if table exists)
  try {
    const { data: observations, error: obsError } = await supabase
      .from("health_observations")
      .select("id, observation_type, value, unit, recorded_at, source_type, created_at")
      .eq("resident_id", residentId)
      .gte("recorded_at", cutoffIso)
      .order("recorded_at", { ascending: false })
      .limit(limit);

    if (!obsError && observations) {
      for (const o of observations) {
        const valueStr = o.unit ? `${o.value} ${o.unit}` : String(o.value ?? "");
        events.push({
          date: o.recorded_at ?? o.created_at,
          event: `${o.observation_type}: ${valueStr}`,
          source: (o.source_type as HealthTimelineEvent["source"]) ?? "self_reported",
          type: "observation",
          observationId: o.id,
        });
      }
    }
  } catch {
    // Table may not exist yet — graceful degradation
  }

  // Sort combined results by date descending
  events.sort((a, b) => (a.date < b.date ? 1 : -1));

  return events.slice(0, limit);
}

// ---------------------------------------------------------------------------
// buildHealthTimeline — convenience wrapper used by API routes
// ---------------------------------------------------------------------------

export async function buildHealthTimeline(params: {
  residentId: string;
  supabase: TypedSupabaseClient;
  limit?: number;
  months?: number;
}): Promise<HealthTimelineEvent[]> {
  return getHealthTimeline(params.supabase, params.residentId, {
    limit: params.limit,
    months: params.months,
  });
}

import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { MemoryCandidate, MemoryContext } from "./schemas";

// ---------------------------------------------------------------------------
// Row types — mirror the DB schema from migrations
// ---------------------------------------------------------------------------

export type MemoryRow = {
  id: string;
  organization_id: string;
  resident_id: string;
  memory_type: string;
  content: Record<string, unknown>;
  confidence: number | null;
  source_type: string | null;
  source_id: string | null;
  confirmation_status: "pending" | "user_confirmed" | "staff_confirmed" | "rejected";
  evidence_level: string;
  occurred_at: string | null;
  valid_from: string;
  valid_to: string | null;
  last_verified_at: string | null;
  supersedes_id: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PreferenceRow = {
  id: string;
  organization_id: string;
  resident_id: string;
  preference_type: string;
  structured_value: Record<string, unknown>;
  source_type: string | null;
  source_ref: string | null;
  confirmation_status: "pending" | "user_confirmed" | "staff_confirmed" | "rejected";
  status: "active" | "superseded" | "revoked" | "expired";
  valid_from: string;
  valid_to: string | null;
  last_verified_at: string | null;
  supersedes_id: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Candidate operations
// ---------------------------------------------------------------------------

export async function saveCandidate(params: {
  supabase: TypedSupabaseClient;
  residentId: string;
  organizationId: string;
  candidate: MemoryCandidate;
  sourceType?: string;
  sourceId?: string;
}): Promise<{ id: string }> {
  const { supabase, residentId, organizationId, candidate, sourceType, sourceId } = params;

  const { data, error } = await supabase.rpc("save_memory_candidate", {
    p_resident_id: residentId,
    p_organization_id: organizationId,
    p_memory_type: candidate.candidate_type,
    p_content: candidate.structured_value,
    p_confidence: candidate.confidence,
    p_source_type: sourceType ?? "assistant_extraction",
    p_source_id: sourceId ?? null,
    p_evidence_level: candidate.evidence_level,
    p_occurred_at: candidate.occurred_at,
    p_deduplication_key: candidate.source_text_summary ?? null,
  });

  if (error) throw new Error(error.message);
  return { id: (data as MemoryRow).id };
}

export async function confirmCandidate(
  supabase: TypedSupabaseClient,
  candidateId: string,
  confirmedBy: string,
): Promise<void> {
  const { error } = await supabase.rpc("confirm_memory_candidate", {
    p_candidate_id: candidateId,
    p_confirmed_by: confirmedBy,
  });
  if (error) throw new Error(error.message);
}

export async function rejectCandidate(
  supabase: TypedSupabaseClient,
  candidateId: string,
  rejectedBy: string,
): Promise<void> {
  const { error } = await supabase.rpc("reject_memory_candidate", {
    p_candidate_id: candidateId,
    p_rejected_by: rejectedBy,
  });
  if (error) throw new Error(error.message);
}

export async function getCandidates(
  supabase: TypedSupabaseClient,
  residentId: string,
  status?: string,
): Promise<MemoryRow[]> {
  let query = supabase
    .from("resident_memories")
    .select("*")
    .eq("resident_id", residentId)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("confirmation_status", status);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as MemoryRow[];
}

// ---------------------------------------------------------------------------
// Memory operations
// ---------------------------------------------------------------------------

export async function getMemories(
  supabase: TypedSupabaseClient,
  residentId: string,
  options?: { type?: string; limit?: number },
): Promise<MemoryRow[]> {
  let query = supabase
    .from("resident_memories")
    .select("*")
    .eq("resident_id", residentId)
    .eq("is_active", true)
    .in("confirmation_status", ["user_confirmed", "staff_confirmed"])
    .order("confidence", { ascending: false })
    .order("occurred_at", { ascending: false });

  if (options?.type) {
    query = query.eq("memory_type", options.type);
  }

  query = query.limit(options?.limit ?? 50);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as MemoryRow[];
}

export async function revokeMemory(
  supabase: TypedSupabaseClient,
  memoryId: string,
  revokedBy: string,
): Promise<void> {
  const { error } = await supabase.rpc("revoke_memory", {
    p_memory_id: memoryId,
    p_revoked_by: revokedBy,
  });
  if (error) throw new Error(error.message);
}

export async function deleteMemory(
  supabase: TypedSupabaseClient,
  memoryId: string,
  deletedBy: string,
): Promise<void> {
  const { error } = await supabase.rpc("delete_memory", {
    p_memory_id: memoryId,
    p_deleted_by: deletedBy,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Preference operations
// ---------------------------------------------------------------------------

export async function getPreferences(
  supabase: TypedSupabaseClient,
  residentId: string,
): Promise<PreferenceRow[]> {
  const { data, error } = await supabase
    .from("resident_preferences")
    .select("*")
    .eq("resident_id", residentId)
    .eq("status", "active")
    .in("confirmation_status", ["user_confirmed", "staff_confirmed"])
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PreferenceRow[];
}

export async function updatePreference(
  supabase: TypedSupabaseClient,
  preferenceId: string,
  value: unknown,
  updatedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from("resident_preferences")
    .update({
      structured_value: value as Record<string, unknown>,
      confirmed_by: updatedBy,
    })
    .eq("id", preferenceId);

  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Context operation
// ---------------------------------------------------------------------------

export type MemoryContextRow = {
  kind: string;
  record_id: string;
  record_type: string;
  content: Record<string, unknown>;
  confidence: number | null;
  occurred_at: string | null;
};

export async function getMemoryContext(
  supabase: TypedSupabaseClient,
  residentId: string,
  maxTokens = 2000,
): Promise<MemoryContextRow[]> {
  const { data, error } = await supabase.rpc("get_memory_context", {
    p_resident_id: residentId,
    p_max_tokens: maxTokens,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as MemoryContextRow[];
}

// ---------------------------------------------------------------------------
// Build MemoryContext from raw rows (used by contextBuilder)
// ---------------------------------------------------------------------------

export function buildMemoryContextFromRows(rows: MemoryContextRow[]): MemoryContext {
  const preferences: MemoryContext["preferences"] = [];
  const recentMemories: MemoryContext["recentMemories"] = [];

  for (const row of rows) {
    if (row.kind === "preference") {
      preferences.push({
        type: row.record_type,
        value: row.content,
        confirmed_at: row.occurred_at ?? "",
      });
    } else {
      recentMemories.push({
        type: row.record_type,
        content: row.content,
        occurred_at: row.occurred_at ?? "",
        evidence_level: "self_reported",
      });
    }
  }

  return {
    preferences,
    recentMemories,
    healthTimeline: [],
    openServices: [],
  };
}

import type { TypedSupabaseClient } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Preference conflict resolution
//
// When a new preference is confirmed and an existing active preference of the
// same type exists for the same resident, the old one is superseded:
//   1. Set old record status = 'superseded'
//   2. Set old record supersedes_id → new preference id (reverse link for audit)
//   3. Set old record valid_to = now()
//
// Note: The confirm_memory_candidate RPC already handles memory superseding
// at the DB level. This function is for preference-level conflicts that
// arise when the application layer inserts a new preference directly.
// ---------------------------------------------------------------------------

export async function resolvePreferenceConflict(
  supabase: TypedSupabaseClient,
  residentId: string,
  organizationId: string,
  preferenceType: string,
  newPreferenceId: string,
): Promise<void> {
  // Find existing active preferences of the same type for this resident
  const { data: existing, error: findError } = await supabase
    .from("resident_preferences")
    .select("id")
    .eq("resident_id", residentId)
    .eq("organization_id", organizationId)
    .eq("preference_type", preferenceType)
    .eq("status", "active")
    .neq("id", newPreferenceId);

  if (findError) throw new Error(findError.message);
  if (!existing || existing.length === 0) return;

  // Supersede all existing active records of the same type
  const { error: updateError } = await supabase
    .from("resident_preferences")
    .update({
      status: "superseded",
      supersedes_id: newPreferenceId,
      valid_to: new Date().toISOString(),
    })
    .in(
      "id",
      existing.map((row) => row.id),
    );

  if (updateError) throw new Error(updateError.message);
}

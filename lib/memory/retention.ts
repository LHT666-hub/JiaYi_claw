import type { TypedSupabaseClient } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Retention — Phase 1: mark expired memories, do not delete.
//
// processExpiredMemories: marks memories where expires_at < now() as inactive.
// processStaleMemories: marks memories where valid_to < now() as inactive.
// ---------------------------------------------------------------------------

export async function processExpiredMemories(
  supabase: TypedSupabaseClient,
): Promise<{ marked: number }> {
  try {
    // Find active memories that have passed their expires_at
    const { data: expired, error: findError } = await supabase
      .from("resident_memories")
      .select("id")
      .eq("is_active", true)
      .not("expires_at", "is", null)
      .lt("expires_at", new Date().toISOString());

    if (findError) throw new Error(findError.message);
    if (!expired || expired.length === 0) return { marked: 0 };

    const ids = expired.map((row) => row.id);
    const { error: updateError } = await supabase
      .from("resident_memories")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", ids);

    if (updateError) throw new Error(updateError.message);
    return { marked: ids.length };
  } catch {
    // Graceful degradation — never throw
    return { marked: 0 };
  }
}

export async function processStaleMemories(
  supabase: TypedSupabaseClient,
): Promise<{ marked: number }> {
  try {
    // Find active memories where valid_to has passed
    const { data: stale, error: findError } = await supabase
      .from("resident_memories")
      .select("id")
      .eq("is_active", true)
      .not("valid_to", "is", null)
      .lt("valid_to", new Date().toISOString());

    if (findError) throw new Error(findError.message);
    if (!stale || stale.length === 0) return { marked: 0 };

    const ids = stale.map((row) => row.id);
    const { error: updateError } = await supabase
      .from("resident_memories")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", ids);

    if (updateError) throw new Error(updateError.message);
    return { marked: ids.length };
  } catch {
    // Graceful degradation — never throw
    return { marked: 0 };
  }
}

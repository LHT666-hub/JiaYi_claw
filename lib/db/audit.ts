import { TypedSupabaseClient } from "@/lib/supabase/types";

type WriteAuditLogInput = {
  actorId?: string | null;
  action: string;
  targetTable?: string | null;
  targetId?: string | null;
  detail?: Record<string, unknown> | null;
  supabase: TypedSupabaseClient;
};

export async function writeAuditLog({
  actorId = null,
  action,
  targetTable = null,
  targetId = null,
  detail = null,
  supabase,
}: WriteAuditLogInput) {
  try {
    await supabase.from("audit_logs").insert({
      actor_id: actorId,
      action,
      target_table: targetTable,
      target_id: targetId,
      detail,
    });
  } catch {
    // Audit should not block the primary flow in MVP mode.
  }
}

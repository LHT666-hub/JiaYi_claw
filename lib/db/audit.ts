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
    const { error } = await supabase.from("audit_logs").insert({
      actor_id: actorId,
      action,
      target_table: targetTable,
      target_id: targetId,
      detail,
    });
    if (error) {
      console.error("audit-log-write-failed", { action, targetTable, code: error.code });
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  } catch (error) {
    console.error("audit-log-write-failed", { action, targetTable, code: "UNEXPECTED" });
    return { ok: false as const, error: error instanceof Error ? error.message : "AUDIT_WRITE_FAILED" };
  }
}

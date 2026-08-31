import { describe, expect, it, vi } from "vitest";
import {
  saveCandidate,
  confirmCandidate,
  rejectCandidate,
  getMemories,
  getPreferences,
  revokeMemory,
  deleteMemory,
  buildMemoryContextFromRows,
} from "./repository";
import type { MemoryCandidate } from "./schemas";
import type { TypedSupabaseClient } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Supabase mock helpers
// ---------------------------------------------------------------------------

function mockRpcSupabase(resolvedValue: { data: unknown; error: null | { message: string } }): TypedSupabaseClient {
  return {
    rpc: vi.fn().mockResolvedValue(resolvedValue),
    from: vi.fn(),
  } as unknown as TypedSupabaseClient;
}

function mockQuerySupabase(tableData: unknown, error: null | { message: string } = null): TypedSupabaseClient {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "eq", "neq", "not", "order", "limit", "in"]) {
    chain[m] = vi.fn();
  }
  // All chain methods return the chain itself
  for (const m of Object.keys(chain)) {
    (chain[m] as ReturnType<typeof vi.fn>).mockImplementation(() => chain);
  }
  // Make the chain thenable
  (chain as Record<string, unknown>).then = vi.fn().mockImplementation(
    (resolve: (v: unknown) => void) => Promise.resolve({ data: tableData, error }).then(resolve),
  );

  const fromFn = vi.fn().mockReturnValue(chain);
  return { from: fromFn, rpc: vi.fn() } as unknown as TypedSupabaseClient;
}

const sampleCandidate: MemoryCandidate = {
  should_store: true,
  candidate_type: "symptom_report",
  structured_value: { symptom: "头晕" },
  evidence_level: "self_reported",
  occurred_at: "2026-08-26T10:00:00.000Z",
  confidence: 0.8,
  importance: 0.6,
  source_text_summary: "居民说头晕",
};

describe("memory repository — saveCandidate", () => {
  it("calls save_memory_candidate RPC with correct params", async () => {
    const supabase = mockRpcSupabase({ data: { id: "new-id-1" }, error: null });
    const result = await saveCandidate({
      supabase,
      residentId: "resident-1",
      organizationId: "org-1",
      candidate: sampleCandidate,
    });

    expect(supabase.rpc).toHaveBeenCalledWith("save_memory_candidate", {
      p_resident_id: "resident-1",
      p_organization_id: "org-1",
      p_memory_type: "symptom_report",
      p_content: { symptom: "头晕" },
      p_confidence: 0.8,
      p_source_type: "assistant_extraction",
      p_source_id: null,
      p_evidence_level: "self_reported",
      p_occurred_at: "2026-08-26T10:00:00.000Z",
      p_deduplication_key: "居民说头晕",
    });
    expect(result.id).toBe("new-id-1");
  });

  it("uses custom sourceType and sourceId when provided", async () => {
    const supabase = mockRpcSupabase({ data: { id: "new-id-2" }, error: null });
    await saveCandidate({
      supabase,
      residentId: "resident-1",
      organizationId: "org-1",
      candidate: sampleCandidate,
      sourceType: "manual_entry",
      sourceId: "source-123",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("save_memory_candidate", expect.objectContaining({
      p_source_type: "manual_entry",
      p_source_id: "source-123",
    }));
  });

  it("throws when RPC returns an error", async () => {
    const supabase = mockRpcSupabase({ data: null, error: { message: "RPC failed" } });
    await expect(
      saveCandidate({
        supabase,
        residentId: "resident-1",
        organizationId: "org-1",
        candidate: sampleCandidate,
      }),
    ).rejects.toThrow("RPC failed");
  });
});

describe("memory repository — confirmCandidate", () => {
  it("calls confirm_memory_candidate RPC", async () => {
    const supabase = mockRpcSupabase({ data: null, error: null });
    await confirmCandidate(supabase, "candidate-1", "user-1");

    expect(supabase.rpc).toHaveBeenCalledWith("confirm_memory_candidate", {
      p_candidate_id: "candidate-1",
      p_confirmed_by: "user-1",
    });
  });

  it("throws on RPC error", async () => {
    const supabase = mockRpcSupabase({ data: null, error: { message: "confirm failed" } });
    await expect(confirmCandidate(supabase, "c1", "u1")).rejects.toThrow("confirm failed");
  });
});

describe("memory repository — rejectCandidate", () => {
  it("calls reject_memory_candidate RPC", async () => {
    const supabase = mockRpcSupabase({ data: null, error: null });
    await rejectCandidate(supabase, "candidate-1", "user-1");

    expect(supabase.rpc).toHaveBeenCalledWith("reject_memory_candidate", {
      p_candidate_id: "candidate-1",
      p_rejected_by: "user-1",
    });
  });

  it("throws on RPC error", async () => {
    const supabase = mockRpcSupabase({ data: null, error: { message: "reject failed" } });
    await expect(rejectCandidate(supabase, "c1", "u1")).rejects.toThrow("reject failed");
  });
});

describe("memory repository — getMemories", () => {
  it("queries resident_memories with active + confirmed filters", async () => {
    const memories = [
      { id: "m1", memory_type: "symptom_report", confirmation_status: "user_confirmed", is_active: true },
    ];
    const supabase = mockQuerySupabase(memories);
    const result = await getMemories(supabase, "resident-1");

    expect(supabase.from).toHaveBeenCalledWith("resident_memories");
    expect(result).toEqual(memories);
  });

  it("returns empty array when no memories found", async () => {
    const supabase = mockQuerySupabase([]);
    const result = await getMemories(supabase, "resident-1");
    expect(result).toEqual([]);
  });

  it("throws on query error", async () => {
    const supabase = mockQuerySupabase(null, { message: "query error" });
    await expect(getMemories(supabase, "resident-1")).rejects.toThrow("query error");
  });
});

describe("memory repository — getPreferences", () => {
  it("queries resident_preferences with active + confirmed filters", async () => {
    const prefs = [
      { id: "p1", preference_type: "preferred_channel", status: "active", confirmation_status: "user_confirmed" },
    ];
    const supabase = mockQuerySupabase(prefs);
    const result = await getPreferences(supabase, "resident-1");

    expect(supabase.from).toHaveBeenCalledWith("resident_preferences");
    expect(result).toEqual(prefs);
  });

  it("returns empty array when no preferences found", async () => {
    const supabase = mockQuerySupabase([]);
    const result = await getPreferences(supabase, "resident-1");
    expect(result).toEqual([]);
  });
});

describe("memory repository — revokeMemory", () => {
  it("calls revoke_memory RPC", async () => {
    const supabase = mockRpcSupabase({ data: null, error: null });
    await revokeMemory(supabase, "memory-1", "user-1");

    expect(supabase.rpc).toHaveBeenCalledWith("revoke_memory", {
      p_memory_id: "memory-1",
      p_revoked_by: "user-1",
    });
  });

  it("throws on RPC error", async () => {
    const supabase = mockRpcSupabase({ data: null, error: { message: "revoke failed" } });
    await expect(revokeMemory(supabase, "m1", "u1")).rejects.toThrow("revoke failed");
  });
});

describe("memory repository — deleteMemory", () => {
  it("calls delete_memory RPC", async () => {
    const supabase = mockRpcSupabase({ data: null, error: null });
    await deleteMemory(supabase, "memory-1", "user-1");

    expect(supabase.rpc).toHaveBeenCalledWith("delete_memory", {
      p_memory_id: "memory-1",
      p_deleted_by: "user-1",
    });
  });

  it("throws on RPC error", async () => {
    const supabase = mockRpcSupabase({ data: null, error: { message: "delete failed" } });
    await expect(deleteMemory(supabase, "m1", "u1")).rejects.toThrow("delete failed");
  });
});

describe("memory repository — buildMemoryContextFromRows", () => {
  it("separates preference rows from memory rows", () => {
    const rows = [
      { kind: "preference", record_id: "p1", record_type: "preferred_channel", content: { channel: "wechat" }, confidence: 0.9, occurred_at: "2026-08-26T00:00:00Z" },
      { kind: "memory", record_id: "m1", record_type: "symptom_report", content: { symptom: "头晕" }, confidence: 0.7, occurred_at: "2026-08-25T00:00:00Z" },
    ];
    const ctx = buildMemoryContextFromRows(rows);

    expect(ctx.preferences).toHaveLength(1);
    expect(ctx.preferences[0].type).toBe("preferred_channel");
    expect(ctx.recentMemories).toHaveLength(1);
    expect(ctx.recentMemories[0].type).toBe("symptom_report");
    expect(ctx.healthTimeline).toEqual([]);
    expect(ctx.openServices).toEqual([]);
  });

  it("returns empty arrays for empty input", () => {
    const ctx = buildMemoryContextFromRows([]);
    expect(ctx.preferences).toEqual([]);
    expect(ctx.recentMemories).toEqual([]);
    expect(ctx.healthTimeline).toEqual([]);
    expect(ctx.openServices).toEqual([]);
  });

  it("handles null occurred_at gracefully", () => {
    const rows = [
      { kind: "memory", record_id: "m1", record_type: "symptom_report", content: {}, confidence: 0.5, occurred_at: null },
    ];
    const ctx = buildMemoryContextFromRows(rows);
    expect(ctx.recentMemories[0].occurred_at).toBe("");
  });
});

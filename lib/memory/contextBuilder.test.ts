import { describe, expect, it, vi } from "vitest";
import { buildMemoryContext, formatMemoryContextForPrompt } from "./contextBuilder";
import type { BuildContextOptions } from "./contextBuilder";

// ---------------------------------------------------------------------------
// Supabase mock — supports .from().select().eq()...maybeSingle() chains
// and .rpc() calls, with per-table response configuration.
// ---------------------------------------------------------------------------

interface MockConfig {
  consentGranted: boolean;
  consentError: boolean;
  memoryContextRows: unknown[];
  memoryContextError: boolean;
  preferences: unknown[];
  memories: unknown[];
  serviceRequestCount: number;
  displayName: string | null;
}

function createSupabaseMock(config: Partial<MockConfig> = {}) {
  const cfg: MockConfig = {
    consentGranted: true,
    consentError: false,
    memoryContextRows: [],
    memoryContextError: false,
    preferences: [],
    memories: [],
    serviceRequestCount: 0,
    displayName: null,
    ...config,
  };

  const rpcFn = vi.fn().mockImplementation((fnName: string, _params: unknown) => {
    if (fnName === "get_memory_context") {
      if (cfg.memoryContextError) {
        return Promise.resolve({ data: null, error: { message: "RPC error" } });
      }
      return Promise.resolve({ data: cfg.memoryContextRows, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  // Build a thenable query chain that resolves based on which table was selected
  function makeChain(table: string, selectOpts?: { count?: string; head?: boolean }) {
    const chain: Record<string, unknown> = {};
    const methods = ["select", "eq", "neq", "not", "order", "limit", "in"];

    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }

    // maybeSingle() returns a thenable that resolves based on table
    chain.maybeSingle = vi.fn().mockImplementation(() => {
      const thenable: Record<string, unknown> = {};
      thenable.then = (resolve: (v: unknown) => void) => {
        if (table === "consents") {
          if (cfg.consentError) return resolve({ data: null, error: { message: "consent error" } });
          return resolve({
            data: cfg.consentGranted ? { granted: true } : { granted: false },
            error: null,
          });
        }
        if (table === "profiles") {
          return resolve({
            data: cfg.displayName ? { display_name: cfg.displayName } : null,
            error: null,
          });
        }
        return resolve({ data: null, error: null });
      };
      return thenable;
    });

    // The chain itself is thenable (for queries that don't use maybeSingle)
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === "resident_preferences") {
        return resolve({ data: cfg.preferences, error: null });
      }
      if (table === "resident_memories") {
        return resolve({ data: cfg.memories, error: null });
      }
      if (table === "service_requests") {
        if (selectOpts?.count) {
          return resolve({ count: cfg.serviceRequestCount, error: null });
        }
        return resolve({ data: [], error: null });
      }
      return resolve({ data: null, error: null });
    };

    return chain;
  }

  const fromFn = vi.fn().mockImplementation((table: string) => {
    // Return an object with select() that creates a chain for this table
    return {
      select: vi.fn().mockImplementation((colsOrOpts?: string | { count?: string; head?: boolean }) => {
        const selectOpts = typeof colsOrOpts === "object" ? colsOrOpts : undefined;
        return makeChain(table, selectOpts);
      }),
    };
  });

  return { from: fromFn, rpc: rpcFn };
}

function makeOptions(supabase: ReturnType<typeof createSupabaseMock>, overrides?: Partial<BuildContextOptions>): BuildContextOptions {
  return {
    residentId: "resident-1",
    organizationId: "org-1",
    maxTokens: 2000,
    supabase: supabase as never,
    ...overrides,
  };
}

describe("contextBuilder — buildMemoryContext", () => {
  it("returns empty context when consent is not granted", async () => {
    const supabase = createSupabaseMock({ consentGranted: false });
    const result = await buildMemoryContext(makeOptions(supabase));

    expect(result.consentStatus.memoryStorage).toBe(false);
    expect(result.preferences).toEqual([]);
    expect(result.relevantMemories).toEqual([]);
    expect(result.recentHealthEvents).toEqual([]);
    expect(result.openServiceCount).toBe(0);
  });

  it("returns empty context when consent query errors", async () => {
    const supabase = createSupabaseMock({ consentError: true });
    const result = await buildMemoryContext(makeOptions(supabase));

    expect(result.consentStatus.memoryStorage).toBe(false);
  });

  it("returns consent granted when consent is true", async () => {
    const supabase = createSupabaseMock({ consentGranted: true });
    const result = await buildMemoryContext(makeOptions(supabase));

    expect(result.consentStatus.memoryStorage).toBe(true);
  });

  it("returns preferences and memories when consent is granted", async () => {
    const supabase = createSupabaseMock({
      consentGranted: true,
      memoryContextRows: [
        { kind: "preference", record_id: "p1", record_type: "preferred_channel", content: { channel: "wechat" }, confidence: 0.9, occurred_at: "2026-08-26T00:00:00Z" },
        { kind: "memory", record_id: "m1", record_type: "symptom_report", content: { symptom: "头晕" }, confidence: 0.7, occurred_at: "2026-08-25T00:00:00Z" },
      ],
    });
    const result = await buildMemoryContext(makeOptions(supabase));

    expect(result.consentStatus.memoryStorage).toBe(true);
    expect(result.preferences.length).toBeGreaterThan(0);
    expect(result.relevantMemories.length).toBeGreaterThan(0);
  });

  it("respects maxTokens parameter (passes to RPC)", async () => {
    const supabase = createSupabaseMock({ consentGranted: true });
    await buildMemoryContext(makeOptions(supabase, { maxTokens: 500 }));

    expect(supabase.rpc).toHaveBeenCalledWith("get_memory_context", {
      p_resident_id: "resident-1",
      p_max_tokens: 500,
    });
  });

  it("falls back to getPreferences/getMemories when RPC returns empty", async () => {
    const supabase = createSupabaseMock({
      consentGranted: true,
      memoryContextRows: [],
      preferences: [
        { preference_type: "large_text", structured_value: { enabled: true }, confirmed_by: "user-1", created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z" },
      ],
      memories: [
        { memory_type: "allergy_self_reported", content: { allergen: "花粉" }, occurred_at: "2026-08-25T00:00:00Z", created_at: "2026-08-25T00:00:00Z", evidence_level: "self_reported" },
      ],
    });
    const result = await buildMemoryContext(makeOptions(supabase));

    expect(result.preferences.length).toBe(1);
    expect(result.preferences[0].type).toBe("large_text");
    expect(result.relevantMemories.length).toBe(1);
    expect(result.relevantMemories[0].type).toBe("allergy_self_reported");
  });

  it("never throws — graceful degradation on unexpected errors", async () => {
    const supabase = {
      rpc: vi.fn().mockRejectedValue(new Error("unexpected")),
      from: vi.fn().mockImplementation(() => { throw new Error("boom"); }),
    };

    const result = await buildMemoryContext(makeOptions(supabase as never));
    expect(result.consentStatus.memoryStorage).toBe(false);
    expect(result.preferences).toEqual([]);
  });
});

describe("contextBuilder — formatMemoryContextForPrompt", () => {
  it("returns empty string when consent not granted", () => {
    const result = formatMemoryContextForPrompt({
      identity: { residentId: "r1" },
      preferences: [],
      relevantMemories: [],
      recentHealthEvents: [],
      openServiceCount: 0,
      consentStatus: { memoryStorage: false },
    });
    expect(result).toBe("");
  });

  it("returns empty string when consent granted but no data", () => {
    const result = formatMemoryContextForPrompt({
      identity: { residentId: "r1" },
      preferences: [],
      relevantMemories: [],
      recentHealthEvents: [],
      openServiceCount: 0,
      consentStatus: { memoryStorage: true },
    });
    expect(result).toBe("");
  });

  it("includes preferences section when present", () => {
    const result = formatMemoryContextForPrompt({
      identity: { residentId: "r1", displayName: "张三" },
      preferences: [{ type: "preferred_channel", value: { channel: "wechat" } }],
      relevantMemories: [],
      recentHealthEvents: [],
      openServiceCount: 0,
      consentStatus: { memoryStorage: true },
    });
    expect(result).toContain("[preferences]");
    expect(result).toContain("preferred_channel");
    expect(result).toContain("居民: 张三");
  });

  it("includes recent_memories section when present", () => {
    const result = formatMemoryContextForPrompt({
      identity: { residentId: "r1" },
      preferences: [],
      relevantMemories: [{ type: "symptom_report", content: { symptom: "头晕" }, occurredAt: "2026-08-26", evidenceLevel: "self_reported" }],
      recentHealthEvents: [],
      openServiceCount: 0,
      consentStatus: { memoryStorage: true },
    });
    expect(result).toContain("[recent_memories]");
    expect(result).toContain("symptom_report");
  });

  it("includes health_events section when present", () => {
    const result = formatMemoryContextForPrompt({
      identity: { residentId: "r1" },
      preferences: [],
      relevantMemories: [],
      recentHealthEvents: [{ date: "2026-08-26", event: "体检", source: "hospital" }],
      openServiceCount: 0,
      consentStatus: { memoryStorage: true },
    });
    expect(result).toContain("[health_events]");
    expect(result).toContain("体检");
  });

  it("includes open_services count when > 0", () => {
    const result = formatMemoryContextForPrompt({
      identity: { residentId: "r1" },
      preferences: [],
      relevantMemories: [],
      recentHealthEvents: [],
      openServiceCount: 3,
      consentStatus: { memoryStorage: true },
    });
    expect(result).toContain("[open_services]");
    expect(result).toContain("3");
  });

  it("wraps output in memory_data tags", () => {
    const result = formatMemoryContextForPrompt({
      identity: { residentId: "r1" },
      preferences: [{ type: "t", value: "v" }],
      relevantMemories: [],
      recentHealthEvents: [],
      openServiceCount: 0,
      consentStatus: { memoryStorage: true },
    });
    expect(result).toContain("<memory_data>");
    expect(result).toContain("</memory_data>");
    expect(result).toContain("DATA");
  });
});

import { describe, expect, it, vi } from "vitest";
import { resolvePreferenceConflict } from "./conflictResolver";

// ---------------------------------------------------------------------------
// Simple Supabase mock — builds a concrete chain per call
// ---------------------------------------------------------------------------

function buildSelectChain(data: unknown, error: { message: string } | null = null) {
  const terminal = Promise.resolve({ data, error });
  // Each method returns an object with the next method, ending in a thenable
  const makeNode = (): Record<string, unknown> => {
    const node: Record<string, unknown> = {};
    for (const m of ["eq", "neq"]) {
      node[m] = vi.fn().mockImplementation(() => makeNode());
    }
    // Make it thenable
    node.then = terminal.then.bind(terminal);
    return node;
  };
  const root: Record<string, unknown> = {
    select: vi.fn().mockImplementation(() => makeNode()),
  };
  return root;
}

function buildUpdateChain(error: { message: string } | null = null) {
  const inFn = vi.fn().mockResolvedValue({ data: null, error });
  const updateFn = vi.fn().mockReturnValue({ in: inFn });
  return { update: updateFn, _inFn: inFn, _updateFn: updateFn };
}

describe("conflictResolver", () => {
  it("supersedes old active preferences of the same type when new one is confirmed", async () => {
    const oldPrefId = "old-pref-1";
    const newPrefId = "new-pref-1";

    const selectChain = buildSelectChain([{ id: oldPrefId }]);
    const updateChain = buildUpdateChain();

    let callCount = 0;
    const mockSupabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return updateChain;
      }),
    };

    await resolvePreferenceConflict(
      mockSupabase as never,
      "resident-1",
      "org-1",
      "preferred_channel",
      newPrefId,
    );

    expect(mockSupabase.from).toHaveBeenCalledWith("resident_preferences");
    expect(updateChain._updateFn).toHaveBeenCalledWith({
      status: "superseded",
      supersedes_id: newPrefId,
      valid_to: expect.any(String),
    });
    expect(updateChain._inFn).toHaveBeenCalledWith("id", [oldPrefId]);
  });

  it("does nothing when no existing active preferences found", async () => {
    const selectChain = buildSelectChain([]);
    const updateFn = vi.fn();

    let callCount = 0;
    const mockSupabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return { update: updateFn };
      }),
    };

    await resolvePreferenceConflict(
      mockSupabase as never,
      "resident-1",
      "org-1",
      "preferred_channel",
      "new-pref-2",
    );

    expect(updateFn).not.toHaveBeenCalled();
  });

  it("supersedes multiple old preferences when they exist", async () => {
    const oldIds = ["old-1", "old-2", "old-3"];
    const newPrefId = "new-pref-3";

    const selectChain = buildSelectChain(oldIds.map((id) => ({ id })));
    const updateChain = buildUpdateChain();

    let callCount = 0;
    const mockSupabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return updateChain;
      }),
    };

    await resolvePreferenceConflict(
      mockSupabase as never,
      "resident-1",
      "org-1",
      "large_text",
      newPrefId,
    );

    expect(updateChain._updateFn).toHaveBeenCalledWith({
      status: "superseded",
      supersedes_id: newPrefId,
      valid_to: expect.any(String),
    });
    expect(updateChain._inFn).toHaveBeenCalledWith("id", oldIds);
  });

  it("throws when select query fails", async () => {
    const selectChain = buildSelectChain(null, { message: "DB connection error" });

    const mockSupabase = {
      from: vi.fn().mockReturnValue(selectChain),
    };

    await expect(
      resolvePreferenceConflict(mockSupabase as never, "r1", "o1", "preferred_channel", "new-1"),
    ).rejects.toThrow("DB connection error");
  });

  it("throws when update query fails", async () => {
    const selectChain = buildSelectChain([{ id: "old-1" }]);
    const updateChain = buildUpdateChain({ message: "Update failed" });

    let callCount = 0;
    const mockSupabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return updateChain;
      }),
    };

    await expect(
      resolvePreferenceConflict(mockSupabase as never, "r1", "o1", "preferred_channel", "new-1"),
    ).rejects.toThrow("Update failed");
  });
});

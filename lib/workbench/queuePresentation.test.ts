import { describe, expect, it } from "vitest";
import { presentQueueItem, summarizeQueue } from "./queuePresentation";

const now = new Date("2026-08-13T08:00:00.000Z");

describe("workbench queue presentation", () => {
  it("marks an unanswered submitted request overdue", () => {
    const presentation = presentQueueItem({
      status: "submitted",
      priority: "high",
      created_at: "2026-08-12T20:00:00.000Z",
      updated_at: "2026-08-12T20:00:00.000Z",
      assigned_to: null,
    }, 4, now);
    expect(presentation.overdue).toBe(true);
    expect(presentation.unassigned).toBe(true);
    expect(presentation.needsTeamAction).toBe(true);
  });

  it("does not count resident confirmation as team action", () => {
    const presentation = presentQueueItem({
      status: "awaiting_user_confirmation",
      priority: "medium",
      created_at: "2026-08-13T02:00:00.000Z",
      updated_at: "2026-08-13T07:00:00.000Z",
      assigned_to: "staff",
    }, 4, now);
    expect(presentation.waitingForResident).toBe(true);
    expect(presentation.needsTeamAction).toBe(false);
  });

  it("summarizes operational buckets", () => {
    const first = { status: "submitted" as const, priority: "emergency" as const, created_at: "2026-08-12T20:00:00.000Z", updated_at: "2026-08-12T20:00:00.000Z", assigned_to: null, presentation: presentQueueItem({ status: "submitted", priority: "emergency", created_at: "2026-08-12T20:00:00.000Z", updated_at: "2026-08-12T20:00:00.000Z", assigned_to: null }, 4, now) };
    const second = { status: "needs_info" as const, priority: "low" as const, created_at: "2026-08-13T06:00:00.000Z", updated_at: "2026-08-13T07:00:00.000Z", assigned_to: "staff", presentation: presentQueueItem({ status: "needs_info", priority: "low", created_at: "2026-08-13T06:00:00.000Z", updated_at: "2026-08-13T07:00:00.000Z", assigned_to: "staff" }, 4, now) };
    expect(summarizeQueue([first, second])).toMatchObject({ total: 2, overdue: 1, highRisk: 1, waitingForResident: 1 });
  });
});

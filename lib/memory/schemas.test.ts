import { describe, expect, it } from "vitest";
import {
  MemoryCandidateSchema,
  MemoryCandidateTypeSchema,
  BlockedCandidateTypeSchema,
  EvidenceLevelSchema,
  ConfirmCandidateSchema,
  MemoryContextSchema,
} from "./schemas";

describe("MemoryCandidateTypeSchema", () => {
  it("accepts all valid candidate types", () => {
    const validTypes = [
      "symptom_report", "medication_statement", "daily_living",
      "care_preference", "health_experience", "allergy_self_reported", "lifestyle",
      "preferred_channel", "preferred_interaction", "large_text",
      "quiet_hours", "preferred_visit_period", "family_assistance",
    ] as const;
    for (const t of validTypes) {
      expect(MemoryCandidateTypeSchema.parse(t)).toBe(t);
    }
  });

  it("rejects blocked types that are not in the allowed enum", () => {
    expect(() => MemoryCandidateTypeSchema.parse("suspected_diagnosis")).toThrow();
    expect(() => MemoryCandidateTypeSchema.parse("diagnosis")).toThrow();
    expect(() => MemoryCandidateTypeSchema.parse("prescription")).toThrow();
  });

  it("rejects completely unknown types", () => {
    expect(() => MemoryCandidateTypeSchema.parse("unknown_type")).toThrow();
  });
});

describe("BlockedCandidateTypeSchema", () => {
  it("accepts blocked candidate types", () => {
    expect(BlockedCandidateTypeSchema.parse("suspected_diagnosis")).toBe("suspected_diagnosis");
    expect(BlockedCandidateTypeSchema.parse("diagnosis")).toBe("diagnosis");
    expect(BlockedCandidateTypeSchema.parse("prescription")).toBe("prescription");
  });

  it("rejects non-blocked types", () => {
    expect(() => BlockedCandidateTypeSchema.parse("symptom_report")).toThrow();
  });
});

describe("EvidenceLevelSchema", () => {
  it("accepts all valid evidence levels", () => {
    const levels = [
      "self_reported", "user_uploaded", "staff_observed",
      "clinician_verified", "system_imported", "system_derived",
    ] as const;
    for (const l of levels) {
      expect(EvidenceLevelSchema.parse(l)).toBe(l);
    }
  });

  it("rejects invalid evidence levels", () => {
    expect(() => EvidenceLevelSchema.parse("user_stated")).toThrow();
    expect(() => EvidenceLevelSchema.parse("")).toThrow();
  });
});

describe("MemoryCandidateSchema", () => {
  const validCandidate = {
    should_store: true,
    candidate_type: "symptom_report" as const,
    structured_value: { symptom: "头晕", severity: "mild" },
    evidence_level: "self_reported" as const,
    occurred_at: "2026-08-26T10:00:00.000Z",
    confidence: 0.8,
    importance: 0.6,
    source_text_summary: "居民说头晕",
  };

  it("passes validation for a valid symptom_report candidate", () => {
    const result = MemoryCandidateSchema.safeParse(validCandidate);
    expect(result.success).toBe(true);
  });

  it("passes validation for a valid preferred_channel candidate", () => {
    const result = MemoryCandidateSchema.safeParse({
      ...validCandidate,
      candidate_type: "preferred_channel",
      structured_value: { channel: "wechat" },
    });
    expect(result.success).toBe(true);
  });

  it("fails when should_store is missing", () => {
    const { should_store, ...rest } = validCandidate;
    expect(MemoryCandidateSchema.safeParse(rest).success).toBe(false);
  });

  it("fails when candidate_type is missing", () => {
    const { candidate_type, ...rest } = validCandidate;
    expect(MemoryCandidateSchema.safeParse(rest).success).toBe(false);
  });

  it("fails when confidence is below 0", () => {
    expect(MemoryCandidateSchema.safeParse({ ...validCandidate, confidence: -0.1 }).success).toBe(false);
  });

  it("fails when confidence is above 1", () => {
    expect(MemoryCandidateSchema.safeParse({ ...validCandidate, confidence: 1.5 }).success).toBe(false);
  });

  it("fails when importance is below 0", () => {
    expect(MemoryCandidateSchema.safeParse({ ...validCandidate, importance: -0.1 }).success).toBe(false);
  });

  it("fails when importance is above 1", () => {
    expect(MemoryCandidateSchema.safeParse({ ...validCandidate, importance: 1.1 }).success).toBe(false);
  });

  it("fails when evidence_level is invalid", () => {
    expect(
      MemoryCandidateSchema.safeParse({ ...validCandidate, evidence_level: "user_stated" }).success,
    ).toBe(false);
  });

  it("fails when candidate_type is invalid", () => {
    expect(
      MemoryCandidateSchema.safeParse({ ...validCandidate, candidate_type: "diagnosis" }).success,
    ).toBe(false);
  });

  it("allows null occurred_at", () => {
    const result = MemoryCandidateSchema.safeParse({ ...validCandidate, occurred_at: null });
    expect(result.success).toBe(true);
  });

  it("allows optional source_text_summary to be absent", () => {
    const { source_text_summary, ...rest } = validCandidate;
    const result = MemoryCandidateSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it("fails when source_text_summary exceeds 200 chars", () => {
    const result = MemoryCandidateSchema.safeParse({
      ...validCandidate,
      source_text_summary: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("accepts confidence at boundary values 0 and 1", () => {
    expect(MemoryCandidateSchema.safeParse({ ...validCandidate, confidence: 0 }).success).toBe(true);
    expect(MemoryCandidateSchema.safeParse({ ...validCandidate, confidence: 1 }).success).toBe(true);
  });
});

describe("ConfirmCandidateSchema", () => {
  it("accepts valid UUIDs", () => {
    const result = ConfirmCandidateSchema.safeParse({
      candidate_id: "550e8400-e29b-41d4-a716-446655440000",
      confirmed_by: "660e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID strings", () => {
    expect(ConfirmCandidateSchema.safeParse({
      candidate_id: "not-a-uuid",
      confirmed_by: "also-not-uuid",
    }).success).toBe(false);
  });
});

describe("MemoryContextSchema", () => {
  it("accepts a valid empty context", () => {
    const result = MemoryContextSchema.safeParse({
      preferences: [],
      recentMemories: [],
      healthTimeline: [],
      openServices: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a context with data", () => {
    const result = MemoryContextSchema.safeParse({
      preferences: [{ type: "preferred_channel", value: { channel: "wechat" }, confirmed_at: "2026-08-26T00:00:00Z" }],
      recentMemories: [{ type: "symptom_report", content: { symptom: "头晕" }, occurred_at: "2026-08-26T00:00:00Z", evidence_level: "self_reported" }],
      healthTimeline: [{ date: "2026-08-26", event: "体检", source: "hospital" }],
      openServices: [{ id: "svc-1", type: "consultation", status: "active" }],
    });
    expect(result.success).toBe(true);
  });
});

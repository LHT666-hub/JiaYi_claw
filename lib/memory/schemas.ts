import { z } from "zod";

// ---------------------------------------------------------------------------
// Candidate types — aligned with migration CHECK constraints
// ---------------------------------------------------------------------------

export const MemoryCandidateTypeSchema = z.enum([
  "symptom_report",
  "medication_statement",
  "daily_living",
  "care_preference",
  "health_experience",
  "allergy_self_reported",
  "lifestyle",
  "preferred_channel",
  "preferred_interaction",
  "large_text",
  "quiet_hours",
  "preferred_visit_period",
  "family_assistance",
]);

export type MemoryCandidateType = z.infer<typeof MemoryCandidateTypeSchema>;

// Additional types that are blocked from user confirmation (routing policy)
export const BlockedCandidateTypeSchema = z.enum([
  "suspected_diagnosis",
  "diagnosis",
  "prescription",
]);

export type BlockedCandidateType = z.infer<typeof BlockedCandidateTypeSchema>;

export const EvidenceLevelSchema = z.enum([
  "self_reported",
  "user_uploaded",
  "staff_observed",
  "clinician_verified",
  "system_imported",
  "system_derived",
]);

export type EvidenceLevel = z.infer<typeof EvidenceLevelSchema>;

// ---------------------------------------------------------------------------
// MemoryCandidateSchema — LLM extraction output
// ---------------------------------------------------------------------------

export const MemoryCandidateSchema = z.object({
  should_store: z.boolean(),
  candidate_type: MemoryCandidateTypeSchema,
  structured_value: z.record(z.string(), z.unknown()),
  evidence_level: EvidenceLevelSchema,
  occurred_at: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  importance: z.number().min(0).max(1),
  source_text_summary: z.string().max(200).optional(),
});

export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;

// ---------------------------------------------------------------------------
// MemoryContextSchema — Agent context memory section
// ---------------------------------------------------------------------------

export const MemoryContextSchema = z.object({
  preferences: z.array(
    z.object({
      type: z.string(),
      value: z.unknown(),
      confirmed_at: z.string(),
    }),
  ),
  recentMemories: z.array(
    z.object({
      type: z.string(),
      content: z.unknown(),
      occurred_at: z.string(),
      evidence_level: z.string(),
    }),
  ),
  healthTimeline: z.array(
    z.object({
      date: z.string(),
      event: z.string(),
      source: z.string(),
    }),
  ),
  openServices: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      status: z.string(),
    }),
  ),
});

export type MemoryContext = z.infer<typeof MemoryContextSchema>;

// ---------------------------------------------------------------------------
// ConfirmCandidateSchema — confirmation request
// ---------------------------------------------------------------------------

export const ConfirmCandidateSchema = z.object({
  candidate_id: z.string().uuid(),
  confirmed_by: z.string().uuid(),
});

export type ConfirmCandidate = z.infer<typeof ConfirmCandidateSchema>;

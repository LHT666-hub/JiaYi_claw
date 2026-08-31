// ---------------------------------------------------------------------------
// lib/memory — Memory Pipeline module
// ---------------------------------------------------------------------------

// Schemas & types
export {
  MemoryCandidateSchema,
  MemoryCandidateTypeSchema,
  BlockedCandidateTypeSchema,
  EvidenceLevelSchema,
  MemoryContextSchema,
  ConfirmCandidateSchema,
} from "./schemas";
export type {
  MemoryCandidate,
  MemoryCandidateType,
  BlockedCandidateType,
  EvidenceLevel,
  MemoryContext,
  ConfirmCandidate,
} from "./schemas";

// Extractor
export { createMemoryExtractor } from "./extractor";
export type { MemoryExtractor } from "./extractor";

// Repository
export {
  saveCandidate,
  confirmCandidate,
  rejectCandidate,
  getCandidates,
  getMemories,
  revokeMemory,
  deleteMemory,
  getPreferences,
  updatePreference,
  getMemoryContext,
  buildMemoryContextFromRows,
} from "./repository";
export type { MemoryRow, PreferenceRow, MemoryContextRow } from "./repository";

// Routing policy
export {
  ROUTING_ALLOWLIST,
  getAllowedTarget,
  isBlocked,
} from "./routingPolicy";
export type { TargetTable, ConfirmAction } from "./routingPolicy";

// Conflict resolver
export { resolvePreferenceConflict } from "./conflictResolver";

// Context builder
export {
  buildMemoryContext,
  formatMemoryContextForPrompt,
} from "./contextBuilder";
export type { BuildContextOptions, BuiltMemoryContext } from "./contextBuilder";

// Health timeline
export { getHealthTimeline, buildHealthTimeline } from "./healthTimeline";
export type { HealthTimelineEvent } from "./healthTimeline";

// Care timeline
export { getCareTimeline, buildCareTimeline } from "./careTimeline";
export type { CareTimelineEvent } from "./careTimeline";

// Retention
export { processExpiredMemories, processStaleMemories } from "./retention";

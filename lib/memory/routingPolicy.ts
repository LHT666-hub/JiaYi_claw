// ---------------------------------------------------------------------------
// Routing Allowlist — maps candidate_type → permitted target table & actions.
// Hard-coded by design: no runtime configuration to prevent accidental writes
// to clinical tables from the memory pipeline.
// ---------------------------------------------------------------------------

export type TargetTable =
  | "resident_preferences"
  | "resident_memories"
  | "health_observations"
  | "workflow"
  | "blocked";

export type ConfirmAction = "write" | "memory_only" | "clinical_flow" | "existing_flow" | "blocked";

type RoutingEntry = {
  targetTable: TargetTable;
  userConfirmAction: ConfirmAction;
  staffConfirmAction: ConfirmAction;
};

export const ROUTING_ALLOWLIST: Record<string, RoutingEntry> = {
  // --- Preference types → resident_preferences ---
  preferred_channel:        { targetTable: "resident_preferences", userConfirmAction: "write",        staffConfirmAction: "write" },
  preferred_interaction:    { targetTable: "resident_preferences", userConfirmAction: "write",        staffConfirmAction: "write" },
  large_text:               { targetTable: "resident_preferences", userConfirmAction: "write",        staffConfirmAction: "write" },
  quiet_hours:              { targetTable: "resident_preferences", userConfirmAction: "write",        staffConfirmAction: "write" },
  preferred_visit_period:   { targetTable: "resident_preferences", userConfirmAction: "write",        staffConfirmAction: "write" },
  family_assistance:        { targetTable: "resident_preferences", userConfirmAction: "write",        staffConfirmAction: "write" },

  // --- Memory types → resident_memories ---
  symptom_report:           { targetTable: "resident_memories", userConfirmAction: "memory_only", staffConfirmAction: "memory_only" },
  medication_statement:     { targetTable: "resident_memories", userConfirmAction: "memory_only", staffConfirmAction: "memory_only" },
  daily_living:             { targetTable: "resident_memories", userConfirmAction: "memory_only", staffConfirmAction: "memory_only" },
  care_preference:          { targetTable: "resident_memories", userConfirmAction: "memory_only", staffConfirmAction: "memory_only" },
  health_experience:        { targetTable: "resident_memories", userConfirmAction: "memory_only", staffConfirmAction: "memory_only" },
  allergy_self_reported:     { targetTable: "resident_memories", userConfirmAction: "memory_only", staffConfirmAction: "memory_only" },
  lifestyle:                { targetTable: "resident_memories", userConfirmAction: "memory_only", staffConfirmAction: "memory_only" },

  // --- Health observation types → health_observations (existing_flow) ---
  health_observation:       { targetTable: "health_observations", userConfirmAction: "existing_flow", staffConfirmAction: "existing_flow" },
  health_condition:         { targetTable: "health_observations", userConfirmAction: "existing_flow", staffConfirmAction: "existing_flow" },
  medication:               { targetTable: "health_observations", userConfirmAction: "existing_flow", staffConfirmAction: "existing_flow" },
  vaccination:              { targetTable: "health_observations", userConfirmAction: "existing_flow", staffConfirmAction: "existing_flow" },

  // --- Blocked types — user confirmation never writes to clinical tables ---
  suspected_diagnosis:      { targetTable: "blocked", userConfirmAction: "blocked",        staffConfirmAction: "clinical_flow" },
  diagnosis:                { targetTable: "blocked", userConfirmAction: "blocked",        staffConfirmAction: "clinical_flow" },
  prescription:             { targetTable: "blocked", userConfirmAction: "blocked",        staffConfirmAction: "clinical_flow" },
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getAllowedTarget(
  candidateType: string,
  confirmedBy: "user" | "staff",
): ConfirmAction {
  const entry = ROUTING_ALLOWLIST[candidateType];
  if (!entry) return "blocked";
  return confirmedBy === "user" ? entry.userConfirmAction : entry.staffConfirmAction;
}

export function isBlocked(candidateType: string): boolean {
  const entry = ROUTING_ALLOWLIST[candidateType];
  if (!entry) return true; // unknown types are blocked by default
  return entry.targetTable === "blocked";
}

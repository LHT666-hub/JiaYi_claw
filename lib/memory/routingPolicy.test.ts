import { describe, expect, it } from "vitest";
import {
  ROUTING_ALLOWLIST,
  getAllowedTarget,
  isBlocked,
} from "./routingPolicy";

describe("routingPolicy", () => {
  describe("getAllowedTarget — user confirmation", () => {
    it("allows write for preference types (preferred_channel)", () => {
      expect(getAllowedTarget("preferred_channel", "user")).toBe("write");
    });

    it("allows write for all preference types", () => {
      const prefTypes = [
        "preferred_channel", "preferred_interaction", "large_text",
        "quiet_hours", "preferred_visit_period", "family_assistance",
      ];
      for (const t of prefTypes) {
        expect(getAllowedTarget(t, "user")).toBe("write");
      }
    });

    it("returns memory_only for symptom_report", () => {
      expect(getAllowedTarget("symptom_report", "user")).toBe("memory_only");
    });

    it("returns memory_only for all memory types", () => {
      const memoryTypes = [
        "symptom_report", "medication_statement", "daily_living",
        "care_preference", "health_experience", "allergy_self_reported", "lifestyle",
      ];
      for (const t of memoryTypes) {
        expect(getAllowedTarget(t, "user")).toBe("memory_only");
      }
    });

    it("returns existing_flow for health_observation", () => {
      expect(getAllowedTarget("health_observation", "user")).toBe("existing_flow");
    });

    it("returns existing_flow for all health observation types", () => {
      const healthTypes = ["health_observation", "health_condition", "medication", "vaccination"];
      for (const t of healthTypes) {
        expect(getAllowedTarget(t, "user")).toBe("existing_flow");
      }
    });

    it("returns blocked for suspected_diagnosis", () => {
      expect(getAllowedTarget("suspected_diagnosis", "user")).toBe("blocked");
    });

    it("returns blocked for diagnosis", () => {
      expect(getAllowedTarget("diagnosis", "user")).toBe("blocked");
    });

    it("returns blocked for prescription", () => {
      expect(getAllowedTarget("prescription", "user")).toBe("blocked");
    });

    it("returns blocked for unknown candidate_type", () => {
      expect(getAllowedTarget("totally_unknown_type", "user")).toBe("blocked");
    });
  });

  describe("getAllowedTarget — staff confirmation", () => {
    it("returns clinical_flow for suspected_diagnosis", () => {
      expect(getAllowedTarget("suspected_diagnosis", "staff")).toBe("clinical_flow");
    });

    it("returns clinical_flow for diagnosis", () => {
      expect(getAllowedTarget("diagnosis", "staff")).toBe("clinical_flow");
    });

    it("returns clinical_flow for prescription", () => {
      expect(getAllowedTarget("prescription", "staff")).toBe("clinical_flow");
    });

    it("returns write for preference types", () => {
      expect(getAllowedTarget("large_text", "staff")).toBe("write");
    });

    it("returns memory_only for memory types", () => {
      expect(getAllowedTarget("lifestyle", "staff")).toBe("memory_only");
    });

    it("returns existing_flow for health observation types", () => {
      const healthTypes = ["health_observation", "health_condition", "medication", "vaccination"];
      for (const t of healthTypes) {
        expect(getAllowedTarget(t, "staff")).toBe("existing_flow");
      }
    });
  });

  describe("isBlocked", () => {
    it("returns true for suspected_diagnosis", () => {
      expect(isBlocked("suspected_diagnosis")).toBe(true);
    });

    it("returns true for diagnosis", () => {
      expect(isBlocked("diagnosis")).toBe(true);
    });

    it("returns true for prescription", () => {
      expect(isBlocked("prescription")).toBe(true);
    });

    it("returns false for preference types", () => {
      expect(isBlocked("preferred_channel")).toBe(false);
    });

    it("returns false for memory types", () => {
      expect(isBlocked("symptom_report")).toBe(false);
    });

    it("returns false for health observation types (routed to existing_flow, not blocked)", () => {
      const healthTypes = ["health_observation", "health_condition", "medication", "vaccination"];
      for (const t of healthTypes) {
        expect(isBlocked(t)).toBe(false);
      }
    });

    it("returns true for unknown types (safe default)", () => {
      expect(isBlocked("nonexistent_type")).toBe(true);
    });
  });

  describe("ROUTING_ALLOWLIST completeness", () => {
    it("covers all preference types with targetTable=resident_preferences", () => {
      const prefTypes = [
        "preferred_channel", "preferred_interaction", "large_text",
        "quiet_hours", "preferred_visit_period", "family_assistance",
      ];
      for (const t of prefTypes) {
        expect(ROUTING_ALLOWLIST[t]).toBeDefined();
        expect(ROUTING_ALLOWLIST[t].targetTable).toBe("resident_preferences");
      }
    });

    it("covers all memory types with targetTable=resident_memories", () => {
      const memoryTypes = [
        "symptom_report", "medication_statement", "daily_living",
        "care_preference", "health_experience", "allergy_self_reported", "lifestyle",
      ];
      for (const t of memoryTypes) {
        expect(ROUTING_ALLOWLIST[t]).toBeDefined();
        expect(ROUTING_ALLOWLIST[t].targetTable).toBe("resident_memories");
      }
    });

    it("covers health observation types with targetTable=health_observations", () => {
      const healthTypes = ["health_observation", "health_condition", "medication", "vaccination"];
      for (const t of healthTypes) {
        expect(ROUTING_ALLOWLIST[t]).toBeDefined();
        expect(ROUTING_ALLOWLIST[t].targetTable).toBe("health_observations");
      }
    });

    it("marks all blocked types with targetTable=blocked", () => {
      for (const t of ["suspected_diagnosis", "diagnosis", "prescription"]) {
        expect(ROUTING_ALLOWLIST[t].targetTable).toBe("blocked");
      }
    });
  });
});

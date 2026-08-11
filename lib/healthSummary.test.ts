import { describe, expect, it } from "vitest";
import { buildHealthSummary } from "./healthSummary";

describe("buildHealthSummary", () => {
  it("keeps the latest record and calculates a neutral numeric delta", () => {
    const result = buildHealthSummary([
      { id: "latest", observation_type: "weight", value: 65.2, secondary_value: null, unit: "kg", measured_at: "2026-08-12T08:00:00.000Z" },
      { id: "previous", observation_type: "weight", value: 66, secondary_value: null, unit: "kg", measured_at: "2026-08-10T08:00:00.000Z" },
    ]);
    expect(result[0]).toMatchObject({ id: "latest", value: 65.2, delta: -0.8 });
  });

  it("keeps both blood pressure values without applying clinical labels", () => {
    const result = buildHealthSummary([
      { id: "bp-2", observation_type: "blood_pressure", value: "126", secondary_value: "78", unit: "mmHg", measured_at: "2026-08-12T08:00:00.000Z" },
      { id: "bp-1", observation_type: "blood_pressure", value: "124", secondary_value: "80", unit: "mmHg", measured_at: "2026-08-11T08:00:00.000Z" },
    ]);
    expect(result[0]).toMatchObject({ value: 126, secondaryValue: 78, delta: 2, secondaryDelta: -2 });
  });

  it("does not invent comparison data when only one valid record exists", () => {
    const result = buildHealthSummary([
      { id: "steps", observation_type: "steps", value: 6230, secondary_value: null, unit: "步", measured_at: "2026-08-12T08:00:00.000Z" },
    ]);
    expect(result[0]).toMatchObject({ delta: null, secondaryDelta: null });
  });
});

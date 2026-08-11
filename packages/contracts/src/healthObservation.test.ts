import { describe, expect, it } from "vitest";
import { healthObservationSchema } from "./index";

const base = {
  measuredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  note: null,
};

describe("health observation contract", () => {
  it("accepts a plausible manual blood pressure record", () => {
    expect(healthObservationSchema.safeParse({
      ...base,
      type: "blood_pressure",
      value: 128,
      secondaryValue: 78,
      unit: "mmHg",
    }).success).toBe(true);
  });

  it("rejects reversed blood pressure values", () => {
    expect(healthObservationSchema.safeParse({
      ...base,
      type: "blood_pressure",
      value: 70,
      secondaryValue: 120,
      unit: "mmHg",
    }).success).toBe(false);
  });

  it("rejects impossible values and unexpected secondary values", () => {
    expect(healthObservationSchema.safeParse({
      ...base,
      type: "weight",
      value: 9999,
      secondaryValue: null,
      unit: "kg",
    }).success).toBe(false);
    expect(healthObservationSchema.safeParse({
      ...base,
      type: "steps",
      value: 5000,
      secondaryValue: 2,
      unit: "步",
    }).success).toBe(false);
  });

  it("rejects a unit that does not match the observation type", () => {
    expect(healthObservationSchema.safeParse({
      ...base,
      type: "blood_glucose",
      value: 5.6,
      secondaryValue: null,
      unit: "mg/dL",
    }).success).toBe(false);
  });

  it("rejects a measurement timestamp in the future", () => {
    expect(healthObservationSchema.safeParse({
      type: "weight",
      value: 66,
      secondaryValue: null,
      unit: "kg",
      measuredAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      note: null,
    }).success).toBe(false);
  });
});

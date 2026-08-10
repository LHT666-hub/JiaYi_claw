import { describe, expect, it } from "vitest";
import { extractMedicalEntities } from "./medicalEntityExtractor";

describe("medical entity extractor", () => {
  it("extracts Chinese symptoms, measurements and appointment intent", () => {
    const result = extractMedicalEntities("我这两天头晕，今天血压 145/92，想预约李医生周三上午");
    expect(result.symptoms[0]?.name).toBe("头晕");
    expect(result.measurements[0]?.value).toBe("145/92");
    expect(result.requestedActions).toContain("预约");
    expect(result.missingInformation).not.toContain("希望预约的日期或时段");
  });

  it("does not infer a diagnosis from a measurement", () => {
    const result = extractMedicalEntities("今天血压 150/95");
    expect(result.mentionedConditions).toEqual([]);
  });
});

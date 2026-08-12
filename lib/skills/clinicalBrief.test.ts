import { describe, expect, it } from "vitest";
import { buildClinicianBrief } from "./clinicalBrief";

const emptyEntities = {
  symptoms: [],
  medications: [],
  measurements: [],
  mentionedConditions: [],
  requestedActions: [],
  missingInformation: [],
};

describe("clinician brief", () => {
  it("does not duplicate Chinese sentence punctuation", () => {
    const brief = buildClinicianBrief({
      residentName: "张阿姨",
      question: "最近偶尔头晕。",
      entities: emptyEntities,
    });

    expect(brief.summary).toBe("张阿姨本次主要诉求：最近偶尔头晕。");
    expect(brief.summary).not.toContain("。。");
  });
});

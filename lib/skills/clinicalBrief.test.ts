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

  it("separates the original request from extracted facts without doubled punctuation", () => {
    const brief = buildClinicianBrief({
      residentName: "张阿姨",
      question: "最近偶尔头晕。",
      entities: {
        ...emptyEntities,
        symptoms: [{ name: "头晕", duration: null, progression: null }],
      },
      appointment: {
        target: "家庭医生沟通",
        department: null,
        preferredDoctor: null,
        preferredDates: ["2026-08-15"],
        preferredTime: "上午",
        contactPhone: "13800138000",
        acceptWaitlist: true,
        note: null,
      },
    });

    expect(brief.summary).toContain("最近偶尔头晕。 居民提到：头晕");
    expect(brief.summary).not.toContain("。。");
  });
});

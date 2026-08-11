import { describe, expect, it } from "vitest";
import { buildAssistantActivity, presentAssistantActivity } from "./activity";

const reply = {
  answer: "已整理。",
  nextStep: "请核对。",
  source: "agent" as const,
  category: "service",
  riskLevel: "low" as const,
  suggestDoctor: false,
};

describe("assistant activity continuity", () => {
  it("stores only a fixed service category and never the prompt", () => {
    const activity = buildAssistantActivity({
      reply,
      skillIds: ["service-intent-extractor"],
      serviceRequest: {
        kind: "registration",
        department: "心内科",
        symptom: "胸闷三天",
      },
      actions: [
        {
          id: "start",
          kind: "service",
          label: "核对并发起挂号协助",
          description: "确认后提交",
          href: "/appointments?target=%E8%83%B8%E9%97%B7%E4%B8%89%E5%A4%A9",
          requiresConfirmation: true,
        },
      ],
    });

    expect(activity).toMatchObject({
      activityType: "service_draft_prepared",
      serviceType: "clinic_registration",
      actionKinds: ["service"],
    });
    expect(JSON.stringify(activity)).not.toContain("胸闷");
    expect(JSON.stringify(activity)).not.toContain("心内科");
  });

  it("presents a safe continuation link without health query parameters", () => {
    const view = presentAssistantActivity({
      id: "activity-1",
      activity_type: "service_draft_prepared",
      service_type: "clinic_registration",
      risk_level: "low",
      created_at: "2026-08-10T12:00:00.000Z",
    });

    expect(view.primaryAction?.href).toBe(
      "/appointments?type=clinic_registration&from=claw",
    );
    expect(view.detail).toContain("原对话未保存");
  });

  it("keeps emergency activity actionable", () => {
    const activity = buildAssistantActivity({
      reply: { ...reply, riskLevel: "emergency" },
      actions: [],
      serviceRequest: null,
      skillIds: ["safety-triage"],
    });
    expect(activity.activityType).toBe("safety_guidance");
  });
});

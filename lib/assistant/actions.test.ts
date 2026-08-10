import { describe, expect, it } from "vitest";
import { buildAssistantActions } from "./actions";
import type { AskReply } from "../types";

function reply(overrides: Partial<AskReply> = {}): AskReply {
  return {
    answer: "我先帮您整理下一步。",
    nextStep: "请核对后再提交。",
    suggestDoctor: false,
    riskLevel: "low",
    category: "服务导航",
    source: "agent",
    ...overrides,
  };
}

describe("Claw action orchestration", () => {
  it("creates a confirmation-only appointment draft", () => {
    const actions = buildAssistantActions({
      question: "帮我预约周三下午心内科",
      reply: reply(),
      serviceRequest: {
        kind: "registration",
        department: "心内科",
        preferredDate: "周三",
        preferredTime: "下午",
      },
    });

    expect(actions[0]).toMatchObject({
      kind: "service",
      requiresConfirmation: true,
    });
    expect(actions[0].href).toContain("type=clinic_registration");
    expect(actions[0].href).toContain("department=%E5%BF%83%E5%86%85%E7%A7%91");
    expect(
      actions.some((action) => action.requiresConfirmation === false),
    ).toBe(true);
  });

  it("never offers an online write action for an emergency", () => {
    const actions = buildAssistantActions({
      question: "我胸痛呼吸困难",
      reply: reply({ riskLevel: "emergency", source: "safety" }),
      serviceRequest: { kind: "registration", symptom: "胸痛" },
    });

    expect(actions).toEqual([
      expect.objectContaining({
        kind: "emergency",
        href: "tel:120",
        requiresConfirmation: false,
      }),
    ]);
  });

  it("routes verified knowledge answers to their source view", () => {
    const actions = buildAssistantActions({
      question: "接种门诊几点开",
      reply: reply({ knowledgeIds: ["verified-entry"] }),
      serviceRequest: null,
    });

    expect(actions[0]).toMatchObject({
      kind: "public_info",
      requiresConfirmation: false,
    });
  });
});

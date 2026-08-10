import { describe, expect, it } from "vitest";
import { agentEvalCases } from "../../data/agentEvalCases";
import { getGuardrailReply } from "../faq";
import { routeSkillIds } from "./registry";

describe("Chinese Agent evaluation set", () => {
  it("contains at least 80 cases", () => {
    expect(agentEvalCases.length).toBeGreaterThanOrEqual(80);
  });

  it("routes every expected skill", () => {
    const misses = agentEvalCases.filter((item) => !routeSkillIds(item.input).includes(item.expectedSkill));
    expect(misses).toEqual([]);
  });

  it("has zero high-risk safety misses", () => {
    const misses = agentEvalCases.filter((item) => item.highRisk && !routeSkillIds(item.input).includes("safety-triage"));
    expect(misses).toEqual([]);
  });

  it("returns a safety reply for every high-risk case", () => {
    const misses = agentEvalCases.filter((item) => {
      if (!item.highRisk) return false;
      const reply = getGuardrailReply(item.input);
      return reply?.source !== "safety" || !["high", "emergency"].includes(reply.riskLevel);
    });
    expect(misses).toEqual([]);
  });
});

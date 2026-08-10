import { describe, expect, it } from "vitest";
import { agentEvalCases } from "../../data/agentEvalCases";
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
});

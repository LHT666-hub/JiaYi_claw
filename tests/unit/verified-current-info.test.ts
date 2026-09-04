import { describe, expect, it } from "vitest";
import {
  buildCurrentInfoNotFoundReply,
  requiresVerifiedCurrentInfo,
} from "@/lib/assistant/verifiedCurrentInfo";

describe("verified current information routing", () => {
  it.each([
    "社区最近有什么活动？",
    "今天有哪些医生坐班？",
    "本周接种门诊开放吗",
    "最新的专家门诊通知",
  ])("requires a verified source for %s", (question) => {
    expect(requiresVerifiedCurrentInfo(question)).toBe(true);
  });

  it.each([
    "家庭医生签约是什么",
    "帮我整理复诊要问的问题",
    "血压记录怎么填写",
    "帮我预约下周二下午的家庭医生",
  ])("allows normal routing for %s", (question) => {
    expect(requiresVerifiedCurrentInfo(question)).toBe(false);
  });

  it("does not invent an answer when current information is missing", () => {
    const reply = buildCurrentInfoNotFoundReply();
    expect(reply.answer).toContain("已经检索");
    expect(reply.answer).toContain("不能");
    expect(reply.citations).toEqual([]);
    expect(reply.source).toBe("fallback");
  });
});

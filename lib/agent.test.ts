import { describe, expect, it } from "vitest";
import { buildAgentReply, inferServiceRequestFromQuestion } from "./agent";

describe("service intent extraction", () => {
  it("routes an explicit hospital transfer request to referral assistance", () => {
    expect(inferServiceRequestFromQuestion("帮我转诊到奉贤区中心医院心内科")).toMatchObject({
      kind: "referral",
      department: "心血管门诊",
      institution: "奉贤区中心医院",
    });
  });

  it("does not create a referral draft for an information-only question", () => {
    expect(inferServiceRequestFromQuestion("转诊怎么办")).toBeNull();
  });

  it("does not turn a product capability question into a booking request", () => {
    expect(inferServiceRequestFromQuestion("家医 Claw 能帮我做什么")).toBeNull();
  });

  it("keeps referral priority when the resident also says appointment", () => {
    expect(inferServiceRequestFromQuestion("帮我预约转诊到奉贤区中心医院")).toMatchObject({
      kind: "referral",
      institution: "奉贤区中心医院",
    });
  });

  it("presents referral as community-first coordination instead of direct registration", () => {
    const reply = buildAgentReply("帮我转诊到奉贤区中心医院心内科", {
      kind: "referral",
      target: "高血压复诊转诊",
      institution: "奉贤区中心医院",
      department: "心内科",
    });
    expect(reply?.agentResult?.intent).toBe("referral_assistance");
    expect(reply?.answer).toContain("所属家医团队评估");
    expect(reply?.agentResult?.cards[0].serviceFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "号源与接诊", value: expect.stringContaining("团队回写") }),
    ]));
  });
});

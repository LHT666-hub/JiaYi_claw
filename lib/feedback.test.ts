import { describe, expect, it } from "vitest";
import { feedbackInput, parseIdempotencyKey } from "@/lib/feedback";

describe("feedback input", () => {
  it("accepts a scoped product report", () => {
    expect(feedbackInput.parse({
      category: "service",
      content: "预约页面提交以后没有看到进度。",
      contactAllowed: true,
      pagePath: "/pages/appointments/index",
    }).content).toContain("预约页面");
  });

  it("rejects short content and external paths", () => {
    expect(feedbackInput.safeParse({ category: "bug", content: "不好", pagePath: "https://bad.example" }).success).toBe(false);
  });

  it("only accepts bounded idempotency keys", () => {
    expect(parseIdempotencyKey("feedback:resident:12345678")).toBe("feedback:resident:12345678");
    expect(parseIdempotencyKey("short")).toBeNull();
    expect(parseIdempotencyKey("bad key with spaces")).toBeNull();
  });
});

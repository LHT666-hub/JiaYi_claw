import { describe, expect, it } from "vitest";
import { classifyOtpFailure } from "./otpErrors";

describe("OTP error classification", () => {
  it("keeps invalid phone errors actionable", () => {
    expect(classifyOtpFailure(new Error("INVALID_PHONE"))).toMatchObject({
      code: "INVALID_PHONE",
      status: 400,
    });
  });

  it("maps provider rate limits to a stable 429 response", () => {
    expect(classifyOtpFailure({ message: "over_request_rate_limit", status: 429 })).toMatchObject({
      code: "OTP_RATE_LIMITED",
      status: 429,
    });
  });

  it("does not expose an unknown provider message", () => {
    const result = classifyOtpFailure(new Error("secret provider diagnostic"));
    expect(result).toMatchObject({ code: "OTP_SERVICE_UNAVAILABLE", status: 503 });
    expect(result.message).not.toContain("secret provider diagnostic");
  });
});

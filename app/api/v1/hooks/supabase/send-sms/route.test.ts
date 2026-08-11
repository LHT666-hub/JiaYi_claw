import { afterEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";

const sendTencentOtp = vi.fn();
vi.mock("@/lib/notifications/tencentSms", () => ({ sendTencentOtp }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Supabase Send SMS Hook", () => {
  it("verifies Standard Webhooks headers before sending the OTP", async () => {
    const secret = "dGVzdC1ob29rLXNlY3JldC0zMi1ieXRlcyE=";
    vi.stubEnv("SUPABASE_SEND_SMS_HOOK_SECRET", `v1,whsec_${secret}`);
    sendTencentOtp.mockResolvedValue({ requestId: "request-1" });
    const body = JSON.stringify({
      user: { phone: "+8613800000000" },
      sms: { otp: "123456" },
    });
    const id = "msg_test";
    const timestamp = new Date();
    const signature = new Webhook(secret).sign(id, timestamp, body);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test/api/v1/hooks/supabase/send-sms", {
      method: "POST",
      headers: {
        "webhook-id": id,
        "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "webhook-signature": signature,
      },
      body,
    }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(sendTencentOtp).toHaveBeenCalledWith(expect.objectContaining({
      phone: "+8613800000000",
      otp: "123456",
    }));
  });

  it("rejects unsigned requests without contacting Tencent", async () => {
    vi.stubEnv("SUPABASE_SEND_SMS_HOOK_SECRET", "v1,whsec_dGVzdC1ob29rLXNlY3JldA==");
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ user: { phone: "+8613800000000" }, sms: { otp: "123456" } }),
    }));
    expect(response.status).toBe(401);
    expect(sendTencentOtp).not.toHaveBeenCalled();
  });
});

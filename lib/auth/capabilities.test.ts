import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthCapabilities } from "./capabilities";

afterEach(() => vi.unstubAllEnvs());

function setPublicSupabase(url = "https://project.supabase.co") {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

describe("authentication capabilities", () => {
  it("allows local Supabase OTP without production SMS credentials", () => {
    setPublicSupabase("http://127.0.0.1:54321");
    expect(getAuthCapabilities().sms.available).toBe(true);
  });

  it("reports formal SMS as unavailable until every provider value exists", () => {
    setPublicSupabase();
    vi.stubEnv("TENCENT_SMS_SECRET_ID", "id");
    expect(getAuthCapabilities()).toMatchObject({
      sms: { available: false },
      staffSms: { available: false },
      preferredResidentChannel: null,
    });
  });

  it("prefers WeChat when both formal channels are configured", () => {
    setPublicSupabase();
    for (const [key, value] of Object.entries({
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      SUPABASE_SEND_SMS_HOOK_SECRET: "v1,whsec_example",
      TENCENT_SMS_SECRET_ID: "id",
      TENCENT_SMS_SECRET_KEY: "key",
      TENCENT_SMS_APP_ID: "app",
      TENCENT_SMS_SIGN_NAME: "sign",
      TENCENT_SMS_TEMPLATE_ID: "template",
      WECHAT_MINIPROGRAM_APP_ID: "wx0000000000000000",
      WECHAT_MINIPROGRAM_APP_SECRET: "secret",
    })) vi.stubEnv(key, value);

    expect(getAuthCapabilities()).toMatchObject({
      sms: { available: true },
      wechat: { available: true },
      preferredResidentChannel: "wechat",
    });
  });
});

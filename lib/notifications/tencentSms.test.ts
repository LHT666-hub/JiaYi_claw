import { describe, expect, it, vi } from "vitest";
import { buildTencentSmsRequest, parseTencentSmsConfig, sendTencentOtp } from "./tencentSms";

const config = {
  secretId: "AKIDEXAMPLE",
  secretKey: "secret-example",
  appId: "1400000000",
  signName: "家医服务",
  templateId: "123456",
  region: "ap-guangzhou",
  templateParamKeys: ["otp", "ttlMinutes"] as Array<"otp" | "ttlMinutes">,
  ttlMinutes: 5,
};

describe("Tencent SMS", () => {
  it("builds a deterministic TC3 request without putting secrets in the body", () => {
    const request = buildTencentSmsRequest({
      phone: "+8613800000000",
      otp: "561166",
      config,
      timestamp: 1551113065,
      sessionContext: "trace-1",
    });
    expect(request.url).toBe("https://sms.tencentcloudapi.com/");
    expect(request.headers.Authorization).toMatch(/^TC3-HMAC-SHA256 Credential=AKIDEXAMPLE\/2019-02-25\/sms\/tc3_request/);
    expect(JSON.parse(request.body)).toEqual({
      PhoneNumberSet: ["+8613800000000"],
      SmsSdkAppId: "1400000000",
      SignName: "家医服务",
      TemplateId: "123456",
      TemplateParamSet: ["561166", "5"],
      SessionContext: "trace-1",
    });
    expect(request.body).not.toContain(config.secretId);
    expect(request.body).not.toContain(config.secretKey);
  });

  it("rejects unsupported template parameter names", () => {
    expect(() => parseTencentSmsConfig({
      TENCENT_SMS_SECRET_ID: "id",
      TENCENT_SMS_SECRET_KEY: "key",
      TENCENT_SMS_APP_ID: "app",
      TENCENT_SMS_SIGN_NAME: "sign",
      TENCENT_SMS_TEMPLATE_ID: "template",
      TENCENT_SMS_TEMPLATE_PARAM_KEYS: "otp,unknown",
    })).toThrow("TENCENT_SMS_TEMPLATE_PARAMS_INVALID");
  });

  it("accepts only an Ok provider result", async () => {
    vi.stubEnv("TENCENT_SMS_SECRET_ID", config.secretId);
    vi.stubEnv("TENCENT_SMS_SECRET_KEY", config.secretKey);
    vi.stubEnv("TENCENT_SMS_APP_ID", config.appId);
    vi.stubEnv("TENCENT_SMS_SIGN_NAME", config.signName);
    vi.stubEnv("TENCENT_SMS_TEMPLATE_ID", config.templateId);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      Response: { SendStatusSet: [{ Code: "Ok" }], RequestId: "request-1" },
    }), { status: 200 })) as unknown as typeof fetch;
    await expect(sendTencentOtp({ phone: "+8613800000000", otp: "123456", traceId: "trace-1", fetchImpl })).resolves.toEqual({ requestId: "request-1" });
    vi.unstubAllEnvs();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeWechatIdentity } from "./wechat";

function jsonResponse(data: unknown) {
  return { ok: true, json: async () => data } as Response;
}

describe("exchangeWechatIdentity", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("exchanges one-time WeChat codes and normalizes the verified phone", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ openid: "openid-1", unionid: "union-1" }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token", expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ errcode: 0, phone_info: { purePhoneNumber: "13800138000", countryCode: "86" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeWechatIdentity({ appId: "wx-app", appSecret: "secret", loginCode: "login-code", phoneCode: "phone-code" })).resolves.toEqual({
      openId: "openid-1",
      unionId: "union-1",
      phone: "+8613800138000",
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("jscode2session");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("getuserphonenumber");
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({ code: "phone-code" });
  });

  it("rejects an expired WeChat session code", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ errcode: 40029, errmsg: "invalid code" }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token" })));
    await expect(exchangeWechatIdentity({ appId: "wx-app", appSecret: "secret", loginCode: "bad-code", phoneCode: "phone-code" }))
      .rejects.toThrow("WECHAT_SESSION_FAILED:40029");
  });
});

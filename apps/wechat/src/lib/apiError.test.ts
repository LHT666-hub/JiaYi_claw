import { describe, expect, it } from "vitest";
import {
  apiErrorFromPayload,
  networkError,
  sessionExpiredError,
} from "./apiError";

describe("mini program API errors", () => {
  it("keeps stable server codes and trace IDs", () => {
    expect(apiErrorFromPayload({
      error: { code: "PUBLIC_INFO_EXPIRED", message: "信息已过期。" },
      traceId: "trace-1",
    }, 410)).toMatchObject({
      code: "PUBLIC_INFO_EXPIRED",
      message: "信息已过期。",
      status: 410,
      traceId: "trace-1",
    });
  });

  it("uses a calm retry message for rate limits", () => {
    expect(apiErrorFromPayload({ error: { message: "provider detail" } }, 429).message)
      .toBe("操作有些频繁，请稍后再试。");
  });

  it("distinguishes network loss from an expired session", () => {
    expect(networkError()).toMatchObject({ code: "NETWORK_ERROR", status: 0 });
    expect(sessionExpiredError()).toMatchObject({ code: "SESSION_EXPIRED", status: 401 });
  });
});

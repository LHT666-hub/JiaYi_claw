import { describe, expect, it } from "vitest";
import { resolveMessageDestination } from "./messageNavigation";

describe("message destination", () => {
  it("keeps the service request id for direct progress navigation", () => {
    expect(resolveMessageDestination("/appointments?id=request-1")).toEqual({
      kind: "progress",
      requestId: "request-1",
    });
    expect(resolveMessageDestination("/service-requests/request-2")).toEqual({
      kind: "progress",
      requestId: "request-2",
    });
  });

  it("allows resident routes and rejects external or staff links", () => {
    expect(resolveMessageDestination("/services")).toEqual({ kind: "services" });
    expect(resolveMessageDestination("https://example.com/phishing")).toEqual({ kind: "none" });
    expect(resolveMessageDestination("/admin/feedback")).toEqual({ kind: "none" });
  });
});

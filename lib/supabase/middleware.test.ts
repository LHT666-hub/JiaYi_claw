import { describe, expect, it } from "vitest";
import { getLegacyPageTarget, isLegacyApiPath } from "../routing/legacy";

describe("production legacy route isolation", () => {
  it("redirects old localStorage pages to formal services", () => {
    expect(getLegacyPageTarget("/courses")).toBe("/services?tab=classroom");
    expect(getLegacyPageTarget("/contacts/doctor-id")).toBe("/services");
    expect(getLegacyPageTarget("/service-progress")).toBe("/appointments");
    expect(getLegacyPageTarget("/welcome")).toBe("/onboarding");
    expect(getLegacyPageTarget("/services")).toBeNull();
  });

  it("retires old write APIs without blocking v1", () => {
    expect(isLegacyApiPath("/api/tasks/complete")).toBe(true);
    expect(isLegacyApiPath("/api/v1/service-requests")).toBe(false);
    expect(isLegacyApiPath("/api/ask")).toBe(false);
  });
});

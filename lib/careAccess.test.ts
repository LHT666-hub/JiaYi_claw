import { describe, expect, it } from "vitest";
import { getCareAccess, requireVerifiedCareAccess } from "@/lib/careAccess";

describe("care access", () => {
  it("opens service and health data only for verified bindings", () => {
    expect(getCareAccess("active")).toMatchObject({
      level: "verified",
      canSubmitService: true,
      canStoreHealthData: true,
    });
  });

  it.each(["pending", "revoked", null])("keeps unverified binding %s read-only", (status) => {
    const access = getCareAccess(status);
    expect(access.canSubmitService).toBe(false);
    expect(access.canStoreHealthData).toBe(false);
  });

  it("uses a stable error when a protected service is attempted", () => {
    expect(() => requireVerifiedCareAccess("pending")).toThrow("CARE_BINDING_VERIFICATION_REQUIRED");
  });
});

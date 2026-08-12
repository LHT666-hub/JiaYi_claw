import { describe, expect, it } from "vitest";
import { getPostLoginPath } from "@/lib/supabase/mvp";

describe("getPostLoginPath", () => {
  it("keeps staff onboarding separate from resident onboarding", () => {
    expect(getPostLoginPath("doctor", null)).toBe("/doctor");
    expect(getPostLoginPath("community", null)).toBe("/doctor");
    expect(getPostLoginPath("admin", null)).toBe("/admin");
  });

  it("sends residents and family members through onboarding when needed", () => {
    expect(getPostLoginPath("resident", null)).toBe("/onboarding");
    expect(getPostLoginPath("family", null)).toBe("/onboarding");
    expect(getPostLoginPath("family", "2026-08-12T00:00:00.000Z")).toBe("/family");
  });
});

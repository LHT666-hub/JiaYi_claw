import { describe, expect, it } from "vitest";
import officialInfo from "./official-public-info.json";

const officialHosts = new Set([
  "www.nhc.gov.cn",
  "www.shanghai.gov.cn",
  "www.fengxian.gov.cn",
  "xxgk.fengxian.gov.cn",
]);

const asDate = (value: string | null | undefined) => value ? new Date(value) : null;

describe("official public information pack", () => {
  it("contains the priority national, Shanghai, Fengxian, Nanqiao and Haiwan scopes", () => {
    const scopes = new Set(officialInfo.map((item) => item.scope));
    for (const scope of ["national", "shanghai", "fengxian", "nanqiao", "haiwan"]) {
      expect(scopes.has(scope)).toBe(true);
    }
  });

  it("uses unique ids and official HTTPS source URLs", () => {
    const ids = officialInfo.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const item of officialInfo) {
      const source = new URL(item.sourceUrl);
      expect(source.protocol).toBe("https:");
      expect(officialHosts.has(source.hostname)).toBe(true);
      expect(item.sourceName.length).toBeGreaterThan(0);
      expect(item.keywords.length).toBeGreaterThan(1);
    }
  });

  it("does not ship already-expired time-sensitive records at the verification date", () => {
    const verificationDate = new Date("2026-09-06T00:00:00+08:00");
    for (const item of officialInfo) {
      const expiresAt = asDate(item.expiresAt);
      if (expiresAt) expect(expiresAt.getTime()).toBeGreaterThan(verificationDate.getTime());
    }
  });

  it("keeps current local schedules on short expiry windows", () => {
    const scheduleItems = officialInfo.filter((item) => item.category.includes("门诊排班"));
    expect(scheduleItems.length).toBeGreaterThanOrEqual(3);
    for (const item of scheduleItems) {
      expect(item.expiresAt).toBeTruthy();
      const verifiedAt = new Date(`${item.verifiedAt}T00:00:00+08:00`).getTime();
      const expiresAt = new Date(item.expiresAt as string).getTime();
      expect(expiresAt - verifiedAt).toBeLessThanOrEqual(90 * 24 * 60 * 60 * 1000);
    }
  });
});

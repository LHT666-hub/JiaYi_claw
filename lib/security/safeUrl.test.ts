import { describe, expect, it } from "vitest";
import { assertSafeOfficialUrl } from "./safeUrl";

describe("official content URL guard", () => {
  it("rejects non-HTTPS sources", async () => {
    await expect(assertSafeOfficialUrl("http://example.com/article", "example.com")).rejects.toThrow("HTTPS_SOURCE_REQUIRED");
  });
  it("rejects hosts outside the reviewed source", async () => {
    await expect(assertSafeOfficialUrl("https://attacker.example/article", "hospital.example")).rejects.toThrow("SOURCE_HOST_NOT_ALLOWED");
  });
});

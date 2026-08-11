import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnvironmentReadiness, summarizeReadiness } from "./readiness";

afterEach(() => vi.unstubAllEnvs());

describe("launch readiness", () => {
  it("never exposes configured secret values", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-sensitive-value");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-sensitive-value");
    vi.stubEnv("KIMI_API_KEY", "kimi-sensitive-value");
    const output = JSON.stringify(getEnvironmentReadiness());
    expect(output).not.toContain("anon-sensitive-value");
    expect(output).not.toContain("service-sensitive-value");
    expect(output).not.toContain("kimi-sensitive-value");
  });

  it("counts blockers separately from optional pending integrations", () => {
    const checks = getEnvironmentReadiness();
    const summary = summarizeReadiness(checks);
    expect(summary.total).toBe(checks.length);
    expect(summary.ready + summary.pending + summary.blocked).toBe(summary.total);
  });
});

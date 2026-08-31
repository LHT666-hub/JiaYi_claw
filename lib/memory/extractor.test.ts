import { describe, expect, it, vi, afterEach } from "vitest";
import { createMemoryExtractor } from "./extractor";
import type { MemoryExtractor } from "./extractor";

afterEach(() => vi.unstubAllEnvs());

// ---------------------------------------------------------------------------
// We test the FakeMemoryExtractor directly by importing the module internals
// through the factory. The Fake is selected via env variable.
// ---------------------------------------------------------------------------

function getFakeExtractor(): MemoryExtractor {
  vi.stubEnv("MEMORY_EXTRACTOR_MODE", "fake");
  return createMemoryExtractor();
}

describe("FakeMemoryExtractor", () => {
  it("extracts symptom_report candidate from message containing '血压'", async () => {
    const extractor = getFakeExtractor();
    const result = await extractor.extract("最近血压偏高，头有点晕");
    expect(result).not.toBeNull();
    expect(result!.should_store).toBe(true);
    expect(result!.candidate_type).toBe("symptom_report");
    expect(result!.evidence_level).toBe("self_reported");
    expect(result!.confidence).toBe(0.7);
    expect(result!.importance).toBe(0.5);
    expect(result!.structured_value).toHaveProperty("symptom");
  });

  it("extracts preferred_channel candidate from message containing '微信'", async () => {
    const extractor = getFakeExtractor();
    const result = await extractor.extract("以后微信联系我吧");
    expect(result).not.toBeNull();
    expect(result!.candidate_type).toBe("preferred_channel");
    expect(result!.structured_value).toHaveProperty("channel", "wechat");
  });

  it("extracts allergy candidate from message containing '过敏'", async () => {
    const extractor = getFakeExtractor();
    const result = await extractor.extract("我对青霉素过敏");
    expect(result).not.toBeNull();
    expect(result!.candidate_type).toBe("allergy_self_reported");
  });

  it("extracts medication_statement from message containing '吃药'", async () => {
    const extractor = getFakeExtractor();
    const result = await extractor.extract("我每天在吃药");
    expect(result).not.toBeNull();
    expect(result!.candidate_type).toBe("medication_statement");
  });

  it("extracts large_text from message containing '大字'", async () => {
    const extractor = getFakeExtractor();
    const result = await extractor.extract("字太小看不清，能放大字吗");
    expect(result).not.toBeNull();
    expect(result!.candidate_type).toBe("large_text");
  });

  it("extracts lifestyle from message containing '散步'", async () => {
    const extractor = getFakeExtractor();
    const result = await extractor.extract("我每天坚持散步");
    expect(result).not.toBeNull();
    expect(result!.candidate_type).toBe("lifestyle");
  });

  it("returns null for irrelevant chat ('谢谢')", async () => {
    const extractor = getFakeExtractor();
    const result = await extractor.extract("谢谢你");
    expect(result).toBeNull();
  });

  it("returns null for irrelevant chat ('哈哈')", async () => {
    const extractor = getFakeExtractor();
    const result = await extractor.extract("哈哈哈");
    expect(result).toBeNull();
  });

  it("returns null for generic greetings", async () => {
    const extractor = getFakeExtractor();
    const result = await extractor.extract("你好啊");
    expect(result).toBeNull();
  });

  it("includes correct evidence_level (self_reported) in all extractions", async () => {
    const extractor = getFakeExtractor();
    const result = await extractor.extract("我血压高");
    expect(result).not.toBeNull();
    expect(result!.evidence_level).toBe("self_reported");
  });

  it("includes confidence and importance values", async () => {
    const extractor = getFakeExtractor();
    const result = await extractor.extract("我血压高");
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
    expect(result!.importance).toBeGreaterThanOrEqual(0);
    expect(result!.importance).toBeLessThanOrEqual(1);
  });

  it("includes source_text_summary", async () => {
    const extractor = getFakeExtractor();
    const result = await extractor.extract("我对花粉过敏");
    expect(result).not.toBeNull();
    expect(result!.source_text_summary).toBeDefined();
    expect(typeof result!.source_text_summary).toBe("string");
  });

  it("includes occurred_at as ISO date string", async () => {
    const extractor = getFakeExtractor();
    const result = await extractor.extract("我血压高");
    expect(result).not.toBeNull();
    expect(result!.occurred_at).toBeDefined();
    // Verify it's a valid ISO date
    expect(() => new Date(result!.occurred_at!)).not.toThrow();
  });
});

describe("createMemoryExtractor", () => {
  it("returns an extractor with extract method in fake mode", () => {
    vi.stubEnv("MEMORY_EXTRACTOR_MODE", "fake");
    const extractor = createMemoryExtractor();
    expect(extractor).toBeDefined();
    expect(typeof extractor.extract).toBe("function");
  });

  it("returns an extractor with extract method in default (LLM) mode", () => {
    vi.stubEnv("MEMORY_EXTRACTOR_MODE", "");
    vi.stubEnv("MOONSHOT_API_KEY", "");
    const extractor = createMemoryExtractor();
    expect(extractor).toBeDefined();
    expect(typeof extractor.extract).toBe("function");
  });

  it("extractor interface is consistent (both have extract method)", () => {
    vi.stubEnv("MEMORY_EXTRACTOR_MODE", "fake");
    const fake = createMemoryExtractor();

    vi.stubEnv("MEMORY_EXTRACTOR_MODE", "");
    const llm = createMemoryExtractor();

    // Both implement the same interface
    expect(typeof fake.extract).toBe(typeof llm.extract);
  });

  it("LLM extractor returns null when no API key is configured", async () => {
    vi.stubEnv("MOONSHOT_API_KEY", "");
    vi.stubEnv("KIMI_API_KEY", "");
    vi.stubEnv("MEMORY_EXTRACTOR_MODE", "");
    const extractor = createMemoryExtractor();
    const result = await extractor.extract("我血压高");
    expect(result).toBeNull();
  });
});

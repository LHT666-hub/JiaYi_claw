import { afterEach, describe, expect, it, vi } from "vitest";
import { getAiModelConfig, getEmbeddingModelConfig, getTextModelCandidates } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("AI provider configuration", () => {
  it("keeps the legacy Moonshot configuration compatible", () => {
    vi.stubEnv("AI_PROVIDER", "moonshot");
    vi.stubEnv("KIMI_API_KEY", "legacy-key");
    vi.stubEnv("KIMI_BASE_URL", "https://moonshot.example/v1");
    vi.stubEnv("KIMI_MODEL", "kimi-test");
    expect(getAiModelConfig("text")).toEqual({
      provider: "moonshot",
      apiKey: "legacy-key",
      baseURL: "https://moonshot.example/v1",
      model: "kimi-test",
    });
  });

  it("routes all core purposes to Aliyun Bailian without mixing legacy keys", () => {
    vi.stubEnv("AI_PROVIDER", "aliyun_bailian");
    vi.stubEnv("DASHSCOPE_API_KEY", "bailian-key");
    vi.stubEnv("KIMI_API_KEY", "must-not-be-used");
    vi.stubEnv("AI_MODEL", "qwen-plus");
    vi.stubEnv("AI_VISION_MODEL", "qwen-vl-max");
    expect(getAiModelConfig("text").apiKey).toBe("bailian-key");
    expect(getAiModelConfig("vision").model).toBe("qwen-vl-max");
    expect(getAiModelConfig("memory").model).toBe("qwen-plus");
    expect(getTextModelCandidates()).toEqual(["qwen-plus"]);
  });

  it("reuses Bailian credentials for the RAG embedding model", () => {
    vi.stubEnv("AI_PROVIDER", "aliyun_bailian");
    vi.stubEnv("DASHSCOPE_API_KEY", "bailian-key");
    vi.stubEnv("RAG_EMBEDDING_API_KEY", "");
    vi.stubEnv("RAG_EMBEDDING_BASE_URL", "");
    vi.stubEnv("RAG_EMBEDDING_MODEL", "");
    expect(getEmbeddingModelConfig()).toMatchObject({
      apiKey: "bailian-key",
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "text-embedding-v4",
    });
  });
});

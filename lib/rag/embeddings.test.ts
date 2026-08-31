import { describe, expect, it } from "vitest";
import { createDeterministicEmbeddingProvider, vectorToSql } from "@/lib/rag/embeddings";

function cosine(left: number[], right: number[]) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

describe("RAG embedding provider", () => {
  it("is deterministic and produces normalized 1024-dimensional vectors", async () => {
    const provider = createDeterministicEmbeddingProvider();
    const [first, second] = await provider.embedMany(["家庭医生转诊流程", "家庭医生转诊流程"]);
    expect(first).toEqual(second);
    expect(first).toHaveLength(1024);
    expect(Math.sqrt(cosine(first, first))).toBeCloseTo(1, 5);
    expect(vectorToSql(first).startsWith("[")).toBe(true);
  });

  it("ranks overlapping Chinese phrases above unrelated content in tests", async () => {
    const provider = createDeterministicEmbeddingProvider();
    const [query, related, unrelated] = await provider.embedMany([
      "家医转诊怎么处理", "家庭医生转诊办理流程", "社区老年活动报名",
    ]);
    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });
});


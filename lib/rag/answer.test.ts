import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGroundedKnowledgeReply } from "@/lib/rag/answer";
import { buildKnowledgeCitations } from "@/lib/rag/search";
import type { KnowledgeSearchHit } from "@/lib/rag/types";

function hit(overrides: Partial<KnowledgeSearchHit> = {}): KnowledgeSearchHit {
  return {
    index: 1, chunkId: "chunk-1", documentId: "document-1", sourceId: "source-1",
    sourceType: "public_info", title: "家庭医生签约服务说明", heading: "转诊协助",
    content: "居民需要上转时，由所属家庭医生团队评估并协助准备转诊资料。",
    category: "service", sourceName: "海湾镇社区卫生服务中心",
    sourceUrl: "https://example.test/service", reviewedAt: "2026-08-20T00:00:00.000Z",
    expiresAt: "2027-08-20T00:00:00.000Z", version: 2,
    textScore: 0.8, vectorScore: 0.9, combinedScore: 0.03, ...overrides,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("grounded RAG answers", () => {
  it("returns structured citations without requiring a model key", async () => {
    vi.stubEnv("KIMI_API_KEY", "");
    const reply = await buildGroundedKnowledgeReply("怎么申请转诊？", [hit()]);
    expect(reply?.source).toBe("knowledge");
    expect(reply?.answer).toContain("已审核");
    expect(reply?.nextStep).toContain("https://example.test/service");
    expect(reply?.citations?.[0]).toMatchObject({ chunkId: "chunk-1", version: 2 });
  });

  it("keeps distinct chunk-level citations from the same document", () => {
    const citations = buildKnowledgeCitations([
      hit(), hit({ chunkId: "chunk-2", index: 2 }),
      hit({ chunkId: "chunk-3", documentId: "document-2", sourceId: "source-2", index: 3 }),
    ]);
    expect(citations.map((item) => item.chunkId)).toEqual(["chunk-1", "chunk-2", "chunk-3"]);
    expect(citations.map((item) => item.index)).toEqual([1, 2, 3]);
  });
});

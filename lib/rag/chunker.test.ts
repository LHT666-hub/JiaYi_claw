import { describe, expect, it } from "vitest";
import { chunkChineseDocument } from "@/lib/rag/chunker";

describe("RAG Chinese structural chunker", () => {
  it("keeps section headings and stable ordinals", () => {
    const chunks = chunkChineseDocument(`第一章 服务对象\n\n老年人和慢病居民可以咨询家庭医生服务。\n\n第二章 转诊流程\n\n由家医团队评估后协助转诊。`, { maxChars: 240 });
    expect(chunks).toHaveLength(2);
    expect(chunks.map((item) => item.heading)).toEqual(["第一章 服务对象", "第二章 转诊流程"]);
    expect(chunks.map((item) => item.ordinal)).toEqual([0, 1]);
    expect(chunks.every((item) => item.contentHash.length === 64)).toBe(true);
  });

  it("splits long Chinese content within the configured bound", () => {
    const chunks = chunkChineseDocument(`一、办理说明\n${"居民应通过所属家医团队核验服务时间。".repeat(80)}`, { maxChars: 300, overlapChars: 60 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((item) => item.content.length <= 300)).toBe(true);
  });

  it("rejects unsafe tiny chunk sizes", () => {
    expect(() => chunkChineseDocument("测试", { maxChars: 100 })).toThrow("RAG_CHUNK_SIZE_TOO_SMALL");
  });
});


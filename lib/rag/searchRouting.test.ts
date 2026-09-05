import { describe, expect, it } from "vitest";
import { shouldSearchInstitutionalKnowledge } from "@/lib/rag/search";

describe("RAG routing", () => {
  it("keeps general health education on the base model", () => {
    expect(shouldSearchInstitutionalKnowledge("高血压是什么？")).toBe(false);
    expect(shouldSearchInstitutionalKnowledge("二甲双胍是干什么的？")).toBe(false);
    expect(shouldSearchInstitutionalKnowledge("每天走多少步比较合适？")).toBe(false);
  });

  it("routes local and current service questions to verified knowledge", () => {
    expect(shouldSearchInstitutionalKnowledge("今天家庭医生几点坐班？")).toBe(true);
    expect(shouldSearchInstitutionalKnowledge("社区卫生服务中心怎么签约？")).toBe(true);
    expect(shouldSearchInstitutionalKnowledge("体检报告在哪里查？")).toBe(true);
    expect(shouldSearchInstitutionalKnowledge("续方需要什么材料？")).toBe(true);
  });
});

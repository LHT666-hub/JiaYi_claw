import { describe, expect, it } from "vitest";
import {
  detectImageMediaType,
  parseDocumentAnalysis,
} from "./analysis";

describe("medical document analysis", () => {
  it("parses a bounded structured explanation and adds a fixed safety notice", () => {
    const result = parseDocumentAnalysis(JSON.stringify({
      documentType: "lab_report",
      visibleText: ["血红蛋白 120 g/L"],
      plainSummary: ["图片中可见血红蛋白结果为 120 g/L。"],
      questionsForClinician: ["这个结果需要结合哪些情况一起看？"],
      uncertainItems: [],
      confidence: "high",
    }));

    expect(result.retained).toBe(false);
    expect(result.safetyNotice).toContain("不提供诊断");
    expect(result.visibleText).toEqual(["血红蛋白 120 g/L"]);
  });

  it("detects image content from magic bytes instead of trusting the filename", () => {
    expect(detectImageMediaType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(detectImageMediaType(Buffer.from("not-an-image"))).toBeNull();
  });

  it("normalizes a provider response that omits the requested field names", () => {
    const result = parseDocumentAnalysis(JSON.stringify({
      item: "血红蛋白",
      result: "120 g/L",
      reference_range: "115 - 150 g/L",
    }));

    expect(result.documentType).toBe("other");
    expect(result.visibleText).toContain("result：120 g/L");
    expect(result.confidence).toBe("low");
  });

  it("normalizes Chinese document labels and scalar provider fields", () => {
    const result = parseDocumentAnalysis(JSON.stringify({
      documentType: "合成测试化验单",
      visibleText: "项目：血红蛋白\n结果：120 g/L",
      plainSummary: "图片中写明血红蛋白结果为 120 g/L。",
      confidence: 0.91,
    }));

    expect(result.documentType).toBe("lab_report");
    expect(result.visibleText).toHaveLength(2);
    expect(result.confidence).toBe("high");
  });
});

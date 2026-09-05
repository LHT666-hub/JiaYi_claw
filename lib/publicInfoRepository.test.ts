import { describe, expect, it } from "vitest";
import { rankPublicInfoRecords, type PublicInfoRecord } from "@/lib/publicInfoRepository";

const records: PublicInfoRecord[] = [
  {
    id: "haiwan-vaccination",
    title: "海湾镇社区卫生服务中心2026年预防接种门诊时间",
    category: "海湾门诊排班",
    content: "接种门诊位于民乐路55号，周四和周六开放。",
    keywords: ["海湾接种时间", "海湾疫苗", "海湾预防接种", "周六接种"],
    sourceName: "奉贤区卫生健康委员会",
    sourceUrl: "https://example.com/haiwan",
    verifiedAt: "2026-09-06",
    expiresAt: null,
    status: "published",
    stale: false,
  },
  {
    id: "nanqiao-vaccination",
    title: "南桥镇社区卫生服务中心2026年预防接种门诊时间",
    category: "南桥门诊排班",
    content: "接种门诊位于育秀东路29号。",
    keywords: ["南桥接种时间", "南桥疫苗", "南桥预防接种"],
    sourceName: "奉贤区卫生健康委员会",
    sourceUrl: "https://example.com/nanqiao",
    verifiedAt: "2026-09-06",
    expiresAt: null,
    status: "published",
    stale: false,
  },
];

describe("public info natural-language retrieval", () => {
  it("finds Haiwan vaccination for colloquial wording", () => {
    expect(rankPublicInfoRecords(records, "海湾周六能打疫苗吗")[0]?.id).toBe("haiwan-vaccination");
  });

  it("finds Nanqiao schedule for non-canonical wording", () => {
    expect(rankPublicInfoRecords(records, "南桥的预防针哪几天")[0]?.id).toBe("nanqiao-vaccination");
  });
});

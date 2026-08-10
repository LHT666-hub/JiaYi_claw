import { publicInfoItems } from "@/data/publicInfo";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import type { AskReply } from "@/lib/types";

export type PublicInfoRecord = {
  id: string;
  title: string;
  category: string;
  content: string;
  keywords: string[];
  sourceName: string;
  sourceUrl: string;
  verifiedAt: string;
  expiresAt: string | null;
  status: "published" | "expired";
  stale: boolean;
};

function isStale(verifiedAt: string, expiresAt?: string | null) {
  const now = Date.now();
  if (expiresAt && new Date(expiresAt).getTime() <= now) return true;
  return now - new Date(verifiedAt).getTime() > 365 * 24 * 60 * 60 * 1000;
}

function score(item: PublicInfoRecord, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 1;
  let value = item.title.toLowerCase().includes(normalized) ? 8 : 0;
  for (const keyword of item.keywords) {
    if (normalized.includes(keyword.toLowerCase()) || keyword.toLowerCase().includes(normalized)) value += 4;
  }
  if (item.content.toLowerCase().includes(normalized)) value += 2;
  return value;
}

function localRecords(): PublicInfoRecord[] {
  return publicInfoItems.map((item) => {
    const stale = isStale(item.updatedAt, null);
    return {
      id: item.id,
      title: item.title,
      category: item.category,
      content: `${item.summary}\n\n${item.details}\n\n${item.nextStep}`,
      keywords: item.keywords,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      verifiedAt: item.updatedAt,
      expiresAt: null,
      status: stale ? "expired" : "published",
      stale,
    };
  });
}

export async function searchPublicInfo(query: string) {
  const supabase = createSupabasePublicServerClient();
  if (supabase) {
    const { data } = await supabase
      .from("public_info_entries")
      .select("id, title, category, content, keywords, source_name, source_url, verified_at, expires_at, status")
      .eq("status", "published")
      .order("verified_at", { ascending: false })
      .limit(100);
    if (data?.length) {
      return data
        .map((item) => ({
          id: item.id as string,
          title: item.title as string,
          category: item.category as string,
          content: item.content as string,
          keywords: (item.keywords as string[]) ?? [],
          sourceName: item.source_name as string,
          sourceUrl: item.source_url as string,
          verifiedAt: item.verified_at as string,
          expiresAt: (item.expires_at as string | null) ?? null,
          status: "published" as const,
          stale: isStale(item.verified_at as string, item.expires_at as string | null),
        }))
        .map((item) => ({ item, score: score(item, query) }))
        .filter(({ score: itemScore }) => !query || itemScore > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(({ item }) => item);
    }
  }

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return [];

  return localRecords()
    .map((item) => ({ item, score: score(item, query) }))
    .filter(({ score: itemScore }) => !query || itemScore > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ item }) => item);
}

export function buildVerifiedPublicInfoReply(item: PublicInfoRecord): AskReply {
  if (item.stale) {
    return {
      answer: `我找到了“${item.title}”的历史资料，但它已超过核验有效期，不能作为当前办理依据。`,
      nextStep: `请通过原文或所属社区确认最新安排。来源：${item.sourceName} ${item.sourceUrl}`,
      suggestDoctor: false,
      riskLevel: "low",
      category: item.category,
      source: "knowledge",
      knowledgeIds: [item.id],
    };
  }

  return {
    answer: `根据已审核公开信息整理：\n\n${item.content}`,
    nextStep: `查看原文或向所属机构确认后再办理。来源：${item.sourceName}（核验于 ${new Date(item.verifiedAt).toLocaleDateString("zh-CN")}）${item.sourceUrl}`,
    suggestDoctor: false,
    riskLevel: "low",
    category: item.category,
    source: "knowledge",
    knowledgeIds: [item.id],
  };
}

export async function getPublicInfoById(id: string) {
  return (await searchPublicInfo("")).find((item) => item.id === id) ?? null;
}

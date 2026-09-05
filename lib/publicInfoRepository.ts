import { publicInfoItems } from "@/data/publicInfo";
import { getRetrievalTerms, normalizeRetrievalQuery } from "@/lib/rag/query";
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

export function scorePublicInfoRecord(item: PublicInfoRecord, query: string) {
  const normalized = normalizeRetrievalQuery(query);
  if (!normalized) return 1;

  const title = normalizeRetrievalQuery(item.title);
  const category = normalizeRetrievalQuery(item.category);
  const content = normalizeRetrievalQuery(item.content);
  const sourceName = normalizeRetrievalQuery(item.sourceName);
  const keywords = item.keywords.map((keyword) => normalizeRetrievalQuery(keyword)).filter(Boolean);
  const terms = getRetrievalTerms(query);

  let value = title === normalized ? 48 : title.includes(normalized) ? 28 : 0;
  if (content.includes(normalized)) value += 12;

  let matchedTerms = 0;
  for (const term of terms) {
    let matched = false;
    if (title.includes(term)) {
      value += 10;
      matched = true;
    }
    if (category.includes(term)) {
      value += 6;
      matched = true;
    }
    for (const keyword of keywords) {
      if (keyword === term) {
        value += 14;
        matched = true;
      } else if (keyword.includes(term) || term.includes(keyword)) {
        value += 8;
        matched = true;
      }
    }
    if (content.includes(term)) {
      value += 3;
      matched = true;
    }
    if (sourceName.includes(term)) {
      value += 2;
      matched = true;
    }
    if (matched) matchedTerms += 1;
  }

  if (matchedTerms >= 2) value += Math.min(16, matchedTerms * 2);
  return value;
}

function localRecords(): PublicInfoRecord[] {
  return publicInfoItems.map((item) => {
    const expiresAt = item.expiresAt ?? null;
    const stale = isStale(item.updatedAt, expiresAt);
    return {
      id: item.id,
      title: item.title,
      category: item.category,
      content: `${item.summary}\n\n${item.details}\n\n${item.nextStep}`,
      keywords: item.keywords,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      verifiedAt: item.updatedAt,
      expiresAt,
      status: stale ? "expired" : "published",
      stale,
    };
  });
}

function fromDatabaseRow(item: Record<string, unknown>): PublicInfoRecord {
  return {
    id: item.id as string,
    title: item.title as string,
    category: item.category as string,
    content: item.content as string,
    keywords: (item.keywords as string[]) ?? [],
    sourceName: item.source_name as string,
    sourceUrl: item.source_url as string,
    verifiedAt: item.verified_at as string,
    expiresAt: (item.expires_at as string | null) ?? null,
    status: "published",
    stale: isStale(item.verified_at as string, item.expires_at as string | null),
  };
}

function mergeRecords(databaseRecords: PublicInfoRecord[], curatedRecords: PublicInfoRecord[]) {
  const merged = new Map<string, PublicInfoRecord>();
  for (const item of curatedRecords) {
    merged.set(`${item.title}\n${item.sourceUrl}`, item);
  }
  // Database rows win when the same official item has already been reviewed and
  // synchronized. Curated Git knowledge still fills gaps in a partial database.
  for (const item of databaseRecords) {
    merged.set(`${item.title}\n${item.sourceUrl}`, item);
  }
  return [...merged.values()];
}

export function rankPublicInfoRecords(records: PublicInfoRecord[], query: string) {
  return records
    .map((item) => ({ item, score: scorePublicInfoRecord(item, query) }))
    .filter(({ score }) => !query || score >= 6)
    .sort((a, b) => b.score - a.score || new Date(b.item.verifiedAt).getTime() - new Date(a.item.verifiedAt).getTime())
    .slice(0, 20)
    .map(({ item }) => item);
}

export async function searchPublicInfo(query: string) {
  const curatedRecords = localRecords();
  const supabase = createSupabasePublicServerClient();
  if (supabase) {
    const timeoutMs = Math.max(500, Number(process.env.PUBLIC_INFO_TIMEOUT_MS ?? 1800));
    let data: Record<string, unknown>[] | null = null;
    try {
      const result = await supabase
        .from("public_info_entries")
        .select("id, title, category, content, keywords, source_name, source_url, verified_at, expires_at, status")
        .eq("status", "published")
        .order("verified_at", { ascending: false })
        .limit(250)
        .abortSignal(AbortSignal.timeout(timeoutMs));
      data = result.data as Record<string, unknown>[] | null;
    } catch {
      data = null;
    }
    if (data?.length) {
      return rankPublicInfoRecords(
        mergeRecords(data.map((item) => fromDatabaseRow(item)), curatedRecords),
        query,
      );
    }
  }

  // Every local item is curated, source-linked and versioned in Git. This keeps
  // verified public answers available during a partial/empty database, an
  // outage, or before the latest Supabase/RAG sync completes.
  return rankPublicInfoRecords(curatedRecords, query);
}

export function buildVerifiedPublicInfoReply(item: PublicInfoRecord): AskReply {
  const citations: NonNullable<AskReply["citations"]> = [{
    index: 1,
    chunkId: `public-info-${item.id}`,
    documentId: item.id,
    sourceId: item.id,
    sourceType: "public_info",
    title: item.title,
    heading: item.category,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    reviewedAt: item.verifiedAt,
    version: 1,
  }];
  if (item.stale) {
    return {
      answer: `我找到了“${item.title}”的历史资料，但它已超过核验有效期，不能作为当前办理依据。`,
      nextStep: `请通过原文或所属社区确认最新安排。来源：${item.sourceName} ${item.sourceUrl}`,
      suggestDoctor: false,
      riskLevel: "low",
      category: item.category,
      source: "knowledge",
      knowledgeIds: [item.id],
      citations,
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
    citations,
  };
}

export async function getPublicInfoById(id: string) {
  const supabase = createSupabasePublicServerClient();
  if (supabase) {
    const { data } = await supabase
      .from("public_info_entries")
      .select("id, title, category, content, keywords, source_name, source_url, verified_at, expires_at, status")
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle();
    if (data) return fromDatabaseRow(data);
  }
  return localRecords().find((item) => item.id === id) ?? null;
}

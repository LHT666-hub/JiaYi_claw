import { getEmbeddingProvider, vectorToSql } from "@/lib/rag/embeddings";
import type { KnowledgeSearchHit, KnowledgeVisibility, RagSupabaseClient } from "@/lib/rag/types";

type SearchRow = {
  chunk_id: string; document_id: string; source_type: string; source_id: string;
  title: string; heading: string | null; content: string; category: string;
  source_name: string; canonical_url: string; reviewed_at: string; expires_at: string | null;
  version: number; text_score: number; vector_score: number; combined_score: number;
};

export async function searchKnowledge(input: {
  supabase: RagSupabaseClient;
  query: string;
  organizationId: string;
  communityId?: string | null;
  visibility?: KnowledgeVisibility[];
  limit?: number;
}): Promise<KnowledgeSearchHit[]> {
  const query = input.query.trim();
  if (!query) return [];
  let queryEmbedding: string | null = null;
  try {
    const provider = getEmbeddingProvider();
    if (provider) queryEmbedding = vectorToSql((await provider.embedMany([query]))[0]);
  } catch {
    queryEmbedding = null;
  }
  const { data, error } = await input.supabase.rpc("search_knowledge_chunks", {
    p_query_text: query,
    p_query_embedding: queryEmbedding,
    p_organization_id: input.organizationId,
    p_community_id: input.communityId ?? null,
    p_visibility: input.visibility ?? ["public", "resident"],
    p_limit: Math.min(Math.max(input.limit ?? 8, 1), 20),
  });
  if (error) {
    if (/search_knowledge_chunks|knowledge_chunks|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return ((data ?? []) as SearchRow[]).map((row, index) => ({
    index: index + 1, chunkId: row.chunk_id, documentId: row.document_id,
    sourceId: row.source_id, sourceType: row.source_type as KnowledgeSearchHit["sourceType"],
    title: row.title, heading: row.heading, content: row.content, category: row.category,
    sourceName: row.source_name, sourceUrl: row.canonical_url, reviewedAt: row.reviewed_at,
    expiresAt: row.expires_at, version: row.version, textScore: Number(row.text_score ?? 0),
    vectorScore: Number(row.vector_score ?? 0), combinedScore: Number(row.combined_score ?? 0),
  }));
}

export function buildKnowledgeCitations(hits: KnowledgeSearchHit[]) {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.chunkId)) return false;
    seen.add(hit.chunkId);
    return true;
  }).slice(0, 5).map((hit, index) => ({ ...hit, index: index + 1 }));
}

import type { SupabaseClient } from "@supabase/supabase-js";

export const RAG_EMBEDDING_DIMENSIONS = 1024;

export type KnowledgeSourceType = "public_info" | "content_item" | "manual";
export type KnowledgeVisibility = "public" | "resident" | "staff";

export type KnowledgeChunkDraft = {
  ordinal: number;
  heading: string | null;
  content: string;
  charCount: number;
  contentHash: string;
};

export type KnowledgeCitation = {
  index: number;
  chunkId: string;
  documentId: string;
  sourceId: string;
  sourceType: KnowledgeSourceType;
  title: string;
  heading: string | null;
  sourceName: string;
  sourceUrl: string;
  reviewedAt: string;
  version: number;
};

export type KnowledgeSearchHit = KnowledgeCitation & {
  content: string;
  category: string;
  expiresAt: string | null;
  textScore: number;
  vectorScore: number;
  combinedScore: number;
  rerankScore?: number;
};

export type RagSupabaseClient = SupabaseClient;


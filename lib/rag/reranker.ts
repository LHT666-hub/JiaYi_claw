import { getAiModelConfig, getDashscopeNativeBaseURL } from "@/lib/ai/config";
import type { KnowledgeSearchHit } from "@/lib/rag/types";

type RerankApiResult = {
  index: number;
  relevance_score: number;
};

type RerankApiResponse = {
  output?: { results?: RerankApiResult[] };
  results?: RerankApiResult[];
};

function envFlag(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return null;
}

export function isKnowledgeRerankerConfigured() {
  const explicit = envFlag("RAG_RERANK_ENABLED");
  if (explicit === false) return false;

  const ai = getAiModelConfig("rag");
  if (ai.provider !== "aliyun_bailian" || !ai.apiKey) return false;

  const hasWorkspaceEndpoint = Boolean(
    process.env.RAG_RERANK_BASE_URL?.trim()
      || process.env.DASHSCOPE_NATIVE_BASE_URL?.trim()
      || process.env.DASHSCOPE_WORKSPACE_ID?.trim()
      || process.env.BAILIAN_WORKSPACE_ID?.trim(),
  );

  // Do not add a new network hop silently when the workspace endpoint is not
  // configured. It can still be explicitly enabled for accounts whose generic
  // DashScope endpoint supports reranking.
  return explicit === true || hasWorkspaceEndpoint;
}

function rerankEndpoint() {
  const explicit = process.env.RAG_RERANK_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return `${getDashscopeNativeBaseURL()}/services/rerank/text-rerank/text-rerank`;
}

function rerankDocument(hit: KnowledgeSearchHit) {
  return [
    `标题：${hit.title}`,
    hit.heading ? `章节：${hit.heading}` : "",
    `类别：${hit.category}`,
    `来源：${hit.sourceName}`,
    `内容：${hit.content}`,
  ].filter(Boolean).join("\n");
}

export async function rerankKnowledgeHits(
  query: string,
  hits: KnowledgeSearchHit[],
  topN: number,
): Promise<KnowledgeSearchHit[]> {
  const limit = Math.min(Math.max(topN, 1), hits.length);
  if (hits.length <= 1 || !isKnowledgeRerankerConfigured()) return hits.slice(0, limit);

  const ai = getAiModelConfig("rag");
  const timeoutMs = Math.min(
    Math.max(Number(process.env.RAG_RERANK_TIMEOUT_MS ?? 2200), 500),
    6000,
  );
  const model = process.env.RAG_RERANK_MODEL?.trim() || "qwen3.7-text-rerank";

  try {
    const response = await fetch(rerankEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: {
          query,
          documents: hits.map(rerankDocument),
        },
        parameters: {
          top_n: limit,
          instruct: "Given a resident healthcare service question, rank passages that directly answer the question. Prefer current, specific, official local information over merely related background text.",
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return hits.slice(0, limit);

    const payload = await response.json() as RerankApiResponse;
    const results = payload.output?.results ?? payload.results ?? [];
    if (!results.length) return hits.slice(0, limit);

    const reranked = results
      .filter((result) => Number.isInteger(result.index) && result.index >= 0 && result.index < hits.length)
      .map((result, index) => ({
        ...hits[result.index],
        index: index + 1,
        rerankScore: Number(result.relevance_score ?? 0),
      }));

    return reranked.length ? reranked : hits.slice(0, limit);
  } catch {
    return hits.slice(0, limit);
  }
}

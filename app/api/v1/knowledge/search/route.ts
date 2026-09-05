import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { buildKnowledgeCitations, searchKnowledge } from "@/lib/rag/search";
import { getApiAuthContext, canAccessWorkbench } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  if (!auth.profile.organization_id) return apiError("ORGANIZATION_REQUIRED", "当前账号未配置服务机构。", 409, traceId);
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) return apiError("KNOWLEDGE_QUERY_REQUIRED", "请输入要检索的问题。", 400, traceId);
  try {
    const hits = await searchKnowledge({
      supabase: auth.supabase, query, organizationId: auth.profile.organization_id,
      communityId: auth.profile.community_id,
      visibility: canAccessWorkbench(auth.profile.role) ? ["public", "resident", "staff"] : ["public", "resident"],
      limit: 8,
      force: true,
    });
    return apiOk({
      query, hits: hits.map((hit) => ({ ...hit, content: hit.content.slice(0, 1200) })),
      citations: buildKnowledgeCitations(hits),
      retrievalMode: ["openai-compatible", "deterministic"].includes(process.env.RAG_EMBEDDING_PROVIDER ?? "")
        ? "hybrid"
        : "keyword",
    }, traceId);
  } catch (error) {
    return apiError("KNOWLEDGE_SEARCH_FAILED", error instanceof Error ? error.message : "知识检索失败。", 500, traceId);
  }
}

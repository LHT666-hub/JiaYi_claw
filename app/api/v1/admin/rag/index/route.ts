import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { indexKnowledgeSource, processPendingKnowledgeJobs } from "@/lib/rag/indexer";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const schema = z.union([
  z.object({ mode: z.literal("source"), sourceType: z.enum(["public_info", "content_item"]), sourceId: z.string().uuid() }),
  z.object({ mode: z.literal("pending"), limit: z.number().int().min(1).max(20).default(5) }),
]);

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile || !["admin", "community"].includes(auth.profile.role)) {
    return apiError("FORBIDDEN", "没有知识索引管理权限。", 403, traceId);
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_RAG_INDEX_REQUEST", "索引参数无效。", 400, traceId);
  try {
    if (parsed.data.mode === "pending") {
      const results = await processPendingKnowledgeJobs({
        supabase: auth.supabase, actorId: auth.profile.id, traceId, limit: parsed.data.limit,
        organizationId: auth.profile.organization_id,
      });
      return apiOk({ processed: results.length, results }, traceId);
    }
    const result = await indexKnowledgeSource({
      supabase: auth.supabase, actorId: auth.profile.id, traceId,
      sourceType: parsed.data.sourceType, sourceId: parsed.data.sourceId,
    });
    return apiOk({ result }, traceId);
  } catch (error) {
    return apiError("RAG_INDEX_FAILED", readErrorMessage(error), 500, traceId);
  }
}

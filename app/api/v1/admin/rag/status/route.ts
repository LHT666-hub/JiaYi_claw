import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile || !["admin", "community"].includes(auth.profile.role)) {
    return apiError("FORBIDDEN", "没有知识索引查看权限。", 403, traceId);
  }
  const organizationId = auth.profile.organization_id;
  if (!organizationId) return apiError("ORGANIZATION_REQUIRED", "当前账号未配置机构。", 409, traceId);
  const [documents, activeDocuments, failedDocuments, jobs, failures] = await Promise.all([
    auth.supabase.from("knowledge_documents").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    auth.supabase.from("knowledge_documents").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active"),
    auth.supabase.from("knowledge_documents").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "failed"),
    auth.supabase.from("knowledge_index_jobs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["pending", "processing"]),
    auth.supabase.from("knowledge_index_jobs").select("id,source_type,source_id,last_error,completed_at").eq("organization_id", organizationId).eq("status", "failed").order("completed_at", { ascending: false }).limit(20),
  ]);
  const error = documents.error ?? activeDocuments.error ?? failedDocuments.error ?? jobs.error ?? failures.error;
  if (error) return apiError("RAG_STATUS_FAILED", error.message, 500, traceId);
  return apiOk({
    documentCount: documents.count ?? 0,
    activeCount: activeDocuments.count ?? 0,
    failedDocumentCount: failedDocuments.count ?? 0,
    openJobCount: jobs.count ?? 0,
    failures: failures.data ?? [],
    embeddingProvider: process.env.RAG_EMBEDDING_PROVIDER ?? "disabled",
  }, traceId);
}

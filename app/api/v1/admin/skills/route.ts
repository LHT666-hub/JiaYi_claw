import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { skillRegistry } from "@/lib/skills/registry";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !supabase) return apiOk({ demo: true, skills: skillRegistry, recentRuns: [
    { skill_id: "safety-triage", status: "success", latency_ms: 42, created_at: new Date().toISOString() },
    { skill_id: "medical-entity-extractor", status: "success", latency_ms: 96, created_at: new Date(Date.now() - 900_000).toISOString() },
  ] }, traceId);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  if (profile.role !== "admin") return apiError("FORBIDDEN", "只有管理员可以查看 Skill 管理。", 403, traceId);

  const { data: recentRuns } = await supabase
    .from("skill_runs")
    .select("skill_id, status, latency_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  return apiOk({ skills: skillRegistry, recentRuns: recentRuns ?? [] }, traceId);
}

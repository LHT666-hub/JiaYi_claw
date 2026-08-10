import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { skillRegistry } from "@/lib/skills/registry";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  if (profile.role !== "admin") return apiError("FORBIDDEN", "只有管理员可以查看 Skill 管理。", 403, traceId);

  const { data: recentRuns } = await supabase
    .from("skill_runs")
    .select("skill_id, status, latency_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  return apiOk({ skills: skillRegistry, recentRuns: recentRuns ?? [] }, traceId);
}

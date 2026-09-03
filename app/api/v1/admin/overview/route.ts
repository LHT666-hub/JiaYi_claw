import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { adminShowcaseOverview } from "@/lib/showcase/admin";

export async function GET(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !auth.supabase) return apiOk(adminShowcaseOverview, traceId);
  if (!auth.supabase || auth.profile?.role !== "admin") return apiError("FORBIDDEN", "只有管理员可以查看运营总览。", 403, traceId);
  const org = auth.profile.organization_id;
  const [requests, staff, content, facts, schedules, channels] = await Promise.all([
    auth.supabase.from("service_requests").select("id,status,created_at", { count: "exact" }).eq("organization_id", org).limit(200),
    auth.supabase.from("profiles").select("id", { count: "exact", head: true }).eq("organization_id", org).in("role", ["doctor", "nurse", "pharmacist", "community", "admin"]),
    auth.supabase.from("content_items").select("id,status", { count: "exact" }).eq("organization_id", org).limit(200),
    auth.supabase.from("resident_fact_candidates").select("id,status", { count: "exact" }).eq("organization_id", org).limit(200),
    auth.supabase.from("practitioner_schedules").select("id,status", { count: "exact" }).eq("organization_id", org).gte("ends_at", new Date().toISOString()).limit(200),
    auth.supabase.from("channel_accounts").select("id,status,receive_capability", { count: "exact" }).eq("organization_id", org),
  ]);
  const error = requests.error ?? staff.error ?? content.error ?? facts.error ?? schedules.error ?? channels.error;
  if (error) return apiError("ADMIN_OVERVIEW_FAILED", error.message, 500, traceId);
  return apiOk({ metrics: {
    serviceRequests: requests.count ?? requests.data?.length ?? 0,
    pendingRequests: (requests.data ?? []).filter((item) => !["failed", "completed", "cancelled"].includes(item.status)).length,
    staff: staff.count ?? 0,
    publishedContent: (content.data ?? []).filter((item) => item.status === "published").length,
    contentToReview: (content.data ?? []).filter((item) => ["candidate", "in_review"].includes(item.status)).length,
    factsToReview: (facts.data ?? []).filter((item) => item.status === "pending").length,
    verifiedSchedules: (schedules.data ?? []).filter((item) => item.status === "verified").length,
    activeChannels: (channels.data ?? []).filter((item) => item.status === "active").length,
  } }, traceId);
}

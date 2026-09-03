import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { adminShowcaseFeedback, demoMutation } from "@/lib/showcase/admin";

const updateInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
  resolutionNote: z.string().trim().max(1000).nullable().optional(),
});

async function requireFeedbackStaff(request: NextRequest) {
  const auth = await getApiAuthContext(request);
  return auth.supabase && auth.profile && ["admin", "community"].includes(auth.profile.role)
    ? auth
    : null;
}

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await requireFeedbackStaff(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !auth) return apiOk(adminShowcaseFeedback, traceId);
  if (!auth) return apiError("FORBIDDEN", "没有居民反馈处理权限。", 403, traceId);
  const profile = auth.profile!;
  const supabase = auth.supabase!;

  const status = request.nextUrl.searchParams.get("status");
  let query = supabase
    .from("user_feedback")
    .select("id,category,content,contact_allowed,page_path,status,resolution_note,created_at,updated_at,user:profiles!user_feedback_user_id_fkey(display_name,phone),resident:profiles!user_feedback_resident_id_fkey(display_name)")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (profile.role !== "admin" && profile.community_id) {
    query = query.eq("community_id", profile.community_id);
  }
  if (status && ["open", "in_progress", "resolved", "closed"].includes(status)) {
    query = query.eq("status", status);
  }
  const result = await query;
  return result.error
    ? apiError("FEEDBACK_LIST_FAILED", result.error.message, 500, traceId)
    : apiOk({ feedback: result.data ?? [] }, traceId);
}

export async function PATCH(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await requireFeedbackStaff(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !auth) return apiOk(demoMutation({ feedback: { status: "resolved" } }), traceId);
  if (!auth) return apiError("FORBIDDEN", "没有居民反馈处理权限。", 403, traceId);
  const parsed = updateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("INVALID_FEEDBACK_ACTION", parsed.error.issues[0]?.message ?? "处理信息不完整。", 400, traceId);
  }
  const result = await auth.supabase.rpc("update_user_feedback", {
    p_feedback_id: parsed.data.id,
    p_status: parsed.data.status,
    p_resolution_note: parsed.data.resolutionNote ?? null,
  });
  return result.error
    ? apiError("FEEDBACK_UPDATE_FAILED", result.error.message, 400, traceId)
    : apiOk({ feedback: result.data }, traceId);
}

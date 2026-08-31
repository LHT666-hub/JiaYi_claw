import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { presentAssistantActivity } from "@/lib/assistant/activity";
import { resolveCareSubject } from "@/lib/careSubjects";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if ((!auth.supabase || !auth.profile) && process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return apiOk({ session: null, activities: [], retentionDays: 30, rawTranscriptStored: false, demo: true }, traceId);
  }
  if (!auth.supabase || !auth.profile)
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);

  try {
    const subject = await resolveCareSubject(
      request,
      auth.profile,
      auth.supabase,
      request.nextUrl.searchParams.get("residentId"),
    );
    const now = new Date().toISOString();
    const { data: session, error: sessionError } = await auth.supabase
      .from("assistant_sessions")
      .select("id,last_activity_at,expires_at,last_channel")
      .eq("created_by", auth.profile.id)
      .eq("resident_id", subject.residentId)
      .gt("expires_at", now)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) {
      return apiOk(
        {
          session: null,
          activities: [],
          retentionDays: 30,
          rawTranscriptStored: false,
        },
        traceId,
      );
    }

    const { data: rows, error: activityError } = await auth.supabase
      .from("assistant_activities")
      .select("id,activity_type,service_type,risk_level,created_at")
      .eq("session_id", session.id)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(12);
    if (activityError) throw activityError;

    return apiOk(
      {
        session: {
          id: session.id,
          lastActivityAt: session.last_activity_at,
          expiresAt: session.expires_at,
          lastChannel: session.last_channel,
        },
        activities: (rows ?? []).map(presentAssistantActivity),
        retentionDays: 30,
        rawTranscriptStored: false,
      },
      traceId,
    );
  } catch (error) {
    return apiError(
      "ASSISTANT_SESSION_LOAD_FAILED",
      error instanceof Error ? error.message : "暂时无法加载 Claw 服务轨迹。",
      500,
      traceId,
    );
  }
}

export async function DELETE(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if ((!auth.supabase || !auth.profile) && process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return apiOk({ cleared: true, demo: true }, traceId);
  }
  if (!auth.supabase || !auth.profile)
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);

  try {
    const subject = await resolveCareSubject(
      request,
      auth.profile,
      auth.supabase,
      request.nextUrl.searchParams.get("residentId"),
    );
    const { data, error } = await auth.supabase.rpc(
      "clear_assistant_session",
      { p_resident_id: subject.residentId },
    );
    if (error) throw error;
    return apiOk({ cleared: Boolean(data) }, traceId);
  } catch (error) {
    return apiError(
      "ASSISTANT_SESSION_CLEAR_FAILED",
      error instanceof Error ? error.message : "暂时无法清除服务轨迹。",
      500,
      traceId,
    );
  }
}

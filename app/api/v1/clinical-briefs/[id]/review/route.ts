import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const inputSchema = z.object({ decision: z.enum(["reviewed", "rejected"]) });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  if (!["doctor", "admin"].includes(auth.profile.role)) return apiError("FORBIDDEN", "只有医生或管理员可以确认接诊前摘要。", 403, traceId);

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_REVIEW_DECISION", "请选择确认或退回。", 400, traceId);
  const id = (await context.params).id;
  if (!z.string().uuid().safeParse(id).success) return apiError("INVALID_BRIEF_ID", "摘要编号格式不正确。", 400, traceId);

  const { data, error } = await auth.supabase.rpc("review_clinical_brief", {
    p_brief_id: id,
    p_decision: parsed.data.decision,
  });
  if (error) {
    const message = readErrorMessage(error);
    const forbidden = /CLINICAL_REVIEWER_REQUIRED|SCOPE_FORBIDDEN/.test(message);
    const conflict = /ALREADY_FINAL/.test(message);
    return apiError(forbidden ? "FORBIDDEN" : conflict ? "BRIEF_REVIEW_CONFLICT" : "BRIEF_REVIEW_FAILED", message, forbidden ? 403 : conflict ? 409 : 500, traceId);
  }
  return apiOk({ brief: data }, traceId);
}

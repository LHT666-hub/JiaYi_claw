import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const reviewSchema = z.object({
  bindingId: z.string().uuid(),
  decision: z.enum(["active", "pending", "revoked"]),
  note: z.string().trim().max(500).nullable().default(null),
});

const reviewRoles = ["doctor", "nurse", "community", "admin"];

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile || !reviewRoles.includes(auth.profile.role)) {
    return apiError("FORBIDDEN", "没有家医签约核验权限。", 403, traceId);
  }
  const status = request.nextUrl.searchParams.get("status") ?? "pending";
  if (!["pending", "active", "revoked", "all"].includes(status)) {
    return apiError("INVALID_BINDING_STATUS", "签约状态筛选无效。", 400, traceId);
  }

  let query = auth.supabase.from("resident_care_bindings").select(`
    id,resident_id,care_network_id,community_id,status,created_at,updated_at,
    resident:profiles!resident_care_bindings_resident_id_fkey(id,display_name,phone,organization_id,community_id),
    network:care_networks!resident_care_bindings_care_network_id_fkey(id,name,organization_id,community_id),
    community:communities!resident_care_bindings_community_id_fkey(id,name)
  `).order("created_at", { ascending: true }).limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  return error
    ? apiError("CARE_BINDING_QUEUE_FAILED", error.message, 500, traceId)
    : apiOk({ bindings: data ?? [] }, traceId);
}

export async function PATCH(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile || !reviewRoles.includes(auth.profile.role)) {
    return apiError("FORBIDDEN", "没有家医签约核验权限。", 403, traceId);
  }
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("INVALID_CARE_BINDING_REVIEW", parsed.error.issues[0]?.message ?? "核验参数无效。", 400, traceId);
  }
  const { data, error } = await auth.supabase.rpc("review_resident_care_binding", {
    p_binding_id: parsed.data.bindingId,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note,
  });
  if (error) {
    const message = readErrorMessage(error);
    const forbidden = /ROLE_REQUIRED|SCOPE_FORBIDDEN/.test(message);
    return apiError(forbidden ? "FORBIDDEN" : "CARE_BINDING_REVIEW_FAILED", message, forbidden ? 403 : 500, traceId);
  }
  return apiOk({ binding: data }, traceId);
}

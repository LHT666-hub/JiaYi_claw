import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getCareNetworkForResident, getResidentCareAccess, resolveResidentScope } from "@/lib/db/carePlatform";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  try {
    let residentId: string | null = null;
    try {
      residentId = await resolveResidentScope(auth.profile, auth.supabase, request.nextUrl.searchParams.get("residentId"));
    } catch (error) {
      if (!(auth.profile.role === "family" && error instanceof Error && error.message === "BOUND_RESIDENT_REQUIRED")) throw error;
    }
    const careState = residentId
      ? await getResidentCareAccess(residentId, auth.supabase)
      : { binding: null, access: null };
    const [network, consents, observations, requests, channelBindings, familyBindings] = await Promise.all([
      residentId && careState.access?.canSubmitService ? getCareNetworkForResident(residentId, auth.supabase) : Promise.resolve(null),
      auth.supabase.from("consents").select("scope,policy_version,granted,granted_at,revoked_at").eq("user_id", auth.profile.id).order("created_at", { ascending: false }),
      residentId && careState.access?.canStoreHealthData ? auth.supabase.from("health_observations").select("id,observation_type,value,secondary_value,unit,measured_at,source").eq("resident_id", residentId).order("measured_at", { ascending: false }).limit(5) : Promise.resolve({ data: [], error: null }),
      residentId ? auth.supabase.from("service_requests").select("id,title,status,service_type,updated_at").eq("resident_id", residentId).order("updated_at", { ascending: false }).limit(10) : Promise.resolve({ data: [], error: null }),
      residentId ? auth.supabase.from("channel_members").select("id,display_name,binding_status,bound_at,channel_account:channel_accounts(name,channel_type)").eq("resident_id", residentId).eq("binding_status", "bound") : Promise.resolve({ data: [], error: null }),
      auth.profile.role === "family" ? auth.supabase.from("family_bindings").select("resident_id,relationship,is_primary,status,resident:profiles!family_bindings_resident_id_fkey(display_name,phone)").eq("family_id", auth.profile.id).eq("status", "active") : Promise.resolve({ data: [], error: null }),
    ]);
    const errors = [consents.error, observations.error, requests.error, channelBindings.error, familyBindings.error].filter(Boolean);
    if (errors.length) throw errors[0];
    return apiOk({ profile: auth.profile, residentId, network, access: careState.access, careBinding: careState.binding, consents: consents.data ?? [], observations: observations.data ?? [], serviceRequests: requests.data ?? [], channelBindings: channelBindings.data ?? [], familyBindings: familyBindings.data ?? [] }, traceId);
  } catch (error) { return apiError("ME_LOAD_FAILED", error instanceof Error ? error.message : "个人资料加载失败。", 500, traceId); }
}

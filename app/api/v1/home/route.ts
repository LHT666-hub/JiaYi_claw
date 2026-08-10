import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { resolveCareSubject } from "@/lib/careSubjects";
import { getCareNetworkForResident, getPublishedContent, getVerifiedSchedules } from "@/lib/db/carePlatform";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  try {
    const careSubject = await resolveCareSubject(
      request,
      profile,
      supabase,
      request.nextUrl.searchParams.get("residentId"),
    );
    const residentId = careSubject.residentId;
    const network = await getCareNetworkForResident(residentId, supabase);
    const institutionIds = (network?.institutions ?? []).map((item: Record<string, unknown>) => item.id as string);
    const catalogOrganizationId = network?.organization_id ?? profile.organization_id;
    const catalogCommunityId = network?.community_id ?? profile.community_id;
    if (!catalogOrganizationId) throw new Error("RESIDENT_TENANT_NOT_CONFIGURED");
    let catalogQuery = supabase.from("service_catalog")
      .select("id,service_type,name,description,owner_role,required_fields,service_hours,access_mode,official_url,response_sla_hours,availability_note")
      .eq("organization_id", catalogOrganizationId)
      .eq("active", true);
    catalogQuery = catalogCommunityId
      ? catalogQuery.or(`community_id.eq.${catalogCommunityId},community_id.is.null`)
      : catalogQuery.is("community_id", null);
    const [requestsResult, notificationsResult, catalogResult, schedules, content] = await Promise.all([
      supabase.from("service_requests").select("id,title,summary,status,service_type,priority,created_at,updated_at,appointment_details(scheduled_at,institution_name,department_name,clinician_name,booking_reference)")
        .eq("resident_id", residentId).order("updated_at", { ascending: false }).limit(5),
      supabase.from("notifications").select("id,title,content,type,link_url,is_read,created_at").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(5),
      catalogQuery.order("created_at"),
      getVerifiedSchedules({ supabase, institutionIds, limit: 6 }),
      getPublishedContent({ supabase, communityId: network?.community_id ?? profile.community_id, limit: 6 }),
    ]);
    if (requestsResult.error) throw requestsResult.error;
    if (notificationsResult.error) throw notificationsResult.error;
    if (catalogResult.error) throw catalogResult.error;
    return apiOk({
      profile: { id: profile.id, displayName: profile.display_name, role: profile.role },
      residentId,
      careSubject: careSubject.selected,
      careSubjects: careSubject.subjects,
      network,
      serviceRequests: requestsResult.data ?? [],
      notifications: notificationsResult.data ?? [],
      serviceCatalog: catalogResult.data ?? [],
      schedules,
      content,
    }, traceId);
  } catch (error) {
    return apiError("HOME_LOAD_FAILED", error instanceof Error ? error.message : "首页暂时无法加载。", 500, traceId);
  }
}

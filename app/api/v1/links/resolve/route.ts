import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { resolveCareSubject } from "@/lib/careSubjects";
import { getCareNetworkForResident } from "@/lib/db/carePlatform";
import { getPublicInfoById } from "@/lib/publicInfoRepository";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

function validHttpsUrl(value: string | null) {
  if (!value || value.length > 2000) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const requestedUrl = validHttpsUrl(request.nextUrl.searchParams.get("url"));
  if (!requestedUrl)
    return apiError("INVALID_OFFICIAL_LINK", "链接格式不安全。", 400, traceId);

  const publicInfoId = request.nextUrl.searchParams.get("publicInfoId")?.trim();
  const contentId = request.nextUrl.searchParams.get("contentId")?.trim();
  if (publicInfoId && contentId)
    return apiError("AMBIGUOUS_PUBLIC_LINK", "公开资料参数冲突。", 400, traceId);
  if (publicInfoId) {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(publicInfoId))
      return apiError("INVALID_PUBLIC_INFO_ID", "公开资料编号格式不正确。", 400, traceId);
    const publicInfo = await getPublicInfoById(publicInfoId);
    if (!publicInfo)
      return apiError("PUBLIC_INFO_NOT_AVAILABLE", "该公开资料已下架或需要重新核验。", 404, traceId);
    const reviewedUrl = validHttpsUrl(publicInfo.sourceUrl);
    if (!reviewedUrl || reviewedUrl !== requestedUrl)
      return apiError("PUBLIC_INFO_SOURCE_MISMATCH", "原文链接与已审核资料不一致。", 403, traceId);
    return apiOk(
      { url: reviewedUrl, sourceType: "public_info", label: publicInfo.title },
      traceId,
    );
  }

  if (contentId) {
    if (!/^[0-9a-f-]{36}$/i.test(contentId))
      return apiError("INVALID_CONTENT_ID", "公开内容编号格式不正确。", 400, traceId);
    const publicClient = createSupabasePublicServerClient();
    if (!publicClient) return apiError("CONTENT_NOT_CONFIGURED", "内容服务尚未配置。", 503, traceId);
    const now = new Date().toISOString();
    const { data, error } = await publicClient.from("content_items")
      .select("id,title,original_url")
      .eq("id", contentId)
      .eq("original_url", requestedUrl)
      .eq("status", "published")
      .or(`effective_from.is.null,effective_from.lte.${now}`)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .maybeSingle();
    if (error) return apiError("CONTENT_LINK_CHECK_FAILED", "暂时无法核验公开内容链接。", 500, traceId);
    if (!data) return apiError("CONTENT_NOT_AVAILABLE", "该内容已下架、过期或链接不一致。", 404, traceId);
    return apiOk({ url: requestedUrl, sourceType: "reviewed_content", label: data.title }, traceId);
  }

  const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile)
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);

  try {
    const subject = await resolveCareSubject(
      request,
      auth.profile,
      auth.supabase,
      request.nextUrl.searchParams.get("residentId"),
    );
    const network = await getCareNetworkForResident(subject.residentId, auth.supabase);
    if (!network?.organization_id)
      return apiError(
        "CARE_NETWORK_REQUIRED",
        "请先绑定家医服务网络。",
        409,
        traceId,
      );

    const institutionIds = (network.institutions ?? []).map(
      (item: Record<string, unknown>) => String(item.id),
    );
    const now = new Date().toISOString();

    const contentQuery = auth.supabase
      .from("content_items")
      .select("id,title,original_url")
      .eq("organization_id", network.organization_id)
      .eq("original_url", requestedUrl)
      .eq("status", "published")
      .or(`effective_from.is.null,effective_from.lte.${now}`)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .limit(1)
      .maybeSingle();

    const publicInfoQuery = auth.supabase
      .from("public_info_entries")
      .select("id,title,source_url")
      .eq("organization_id", network.organization_id)
      .eq("source_url", requestedUrl)
      .eq("status", "published")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .limit(1)
      .maybeSingle();

    let catalogQuery = auth.supabase
      .from("service_catalog")
      .select("id,name,official_url")
      .eq("organization_id", network.organization_id)
      .eq("official_url", requestedUrl)
      .eq("active", true);
    catalogQuery = network.community_id
      ? catalogQuery.or(
          `community_id.eq.${network.community_id},community_id.is.null`,
        )
      : catalogQuery.is("community_id", null);

    const institutionQueries = institutionIds.length
      ? [
          auth.supabase
            .from("institutions")
            .select("id,name,official_url,registration_url")
            .in("id", institutionIds)
            .eq("status", "active")
            .eq("official_url", requestedUrl)
            .limit(1)
            .maybeSingle(),
          auth.supabase
            .from("institutions")
            .select("id,name,official_url,registration_url")
            .in("id", institutionIds)
            .eq("status", "active")
            .eq("registration_url", requestedUrl)
            .limit(1)
            .maybeSingle(),
          auth.supabase
            .from("practitioner_schedules")
            .select("id,registration_url,institution:institutions(name)")
            .in("institution_id", institutionIds)
            .eq("registration_url", requestedUrl)
            .eq("status", "verified")
            .gte("ends_at", now)
            .limit(1)
            .maybeSingle(),
        ]
      : [];

    const [content, publicInfo, catalog, ...institutionResults] =
      await Promise.all([
        contentQuery,
        publicInfoQuery,
        catalogQuery.limit(1).maybeSingle(),
        ...institutionQueries,
      ]);
    const firstError = [content, publicInfo, catalog, ...institutionResults]
      .map((result) => result.error)
      .find(Boolean);
    if (firstError) throw firstError;

    if (content.data)
      return apiOk(
        { url: requestedUrl, sourceType: "reviewed_content", label: content.data.title },
        traceId,
      );
    if (publicInfo.data)
      return apiOk(
        { url: requestedUrl, sourceType: "public_info", label: publicInfo.data.title },
        traceId,
      );
    if (catalog.data)
      return apiOk(
        { url: requestedUrl, sourceType: "service_catalog", label: catalog.data.name },
        traceId,
      );
    const institution = institutionResults.find((result) => result.data)
      ?.data as
      | {
          name?: string;
          institution?: { name?: string } | Array<{ name?: string }>;
        }
      | null
      | undefined;
    if (institution) {
      const relation = Array.isArray(institution.institution)
        ? institution.institution[0]
        : institution.institution;
      return apiOk(
        {
          url: requestedUrl,
          sourceType: "verified_institution",
          label: institution.name ?? relation?.name ?? "官方医疗服务页面",
        },
        traceId,
      );
    }

    return apiError(
      "UNVERIFIED_OFFICIAL_LINK",
      "该链接不在当前家医网络的已核验来源中。",
      403,
      traceId,
    );
  } catch (error) {
    return apiError(
      "OFFICIAL_LINK_CHECK_FAILED",
      error instanceof Error ? error.message : "暂时无法核验官方链接。",
      500,
      traceId,
    );
  }
}

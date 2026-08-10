import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { ProfileRow } from "@/lib/types";

export async function resolveResidentScope(
  profile: ProfileRow,
  supabase: TypedSupabaseClient,
  requestedResidentId?: string | null,
) {
  if (profile.role === "resident") return profile.id;
  if (profile.role === "family") {
    if (!requestedResidentId) {
      const { data } = await supabase.from("family_bindings").select("resident_id")
        .eq("family_id", profile.id).eq("status", "active").order("is_primary", { ascending: false }).limit(1).maybeSingle();
      if (!data?.resident_id) throw new Error("BOUND_RESIDENT_REQUIRED");
      return data.resident_id as string;
    }
    const { data } = await supabase.from("family_bindings").select("id")
      .eq("family_id", profile.id).eq("resident_id", requestedResidentId).eq("status", "active").maybeSingle();
    if (!data) throw new Error("RESIDENT_SCOPE_FORBIDDEN");
    return requestedResidentId;
  }
  if (requestedResidentId && ["doctor", "nurse", "pharmacist", "community", "admin"].includes(profile.role)) {
    return requestedResidentId;
  }
  throw new Error("RESIDENT_SCOPE_FORBIDDEN");
}

export async function getCareNetworkForResident(residentId: string, supabase: TypedSupabaseClient) {
  const { data, error } = await supabase.from("resident_care_bindings").select(`
    resident_id,
    primary_practitioner_id,
    care_network:care_networks!inner(
      id,name,description,organization_id,community_id,
      community:communities!inner(id,name,service_phone,address),
      members:care_network_institutions(
        network_role,sort_order,
        institution:institutions(id,name,short_name,institution_type,level_label,address,service_phone,official_url,registration_url,logo_url,verified_at)
      )
    )
  `).eq("resident_id", residentId).eq("status", "active").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.care_network) return null;
  const network = Array.isArray(data.care_network) ? data.care_network[0] : data.care_network;
  const community = Array.isArray(network.community) ? network.community[0] : network.community;
  const institutions = (network.members ?? []).map((member: Record<string, unknown>) => {
    const institution = Array.isArray(member.institution) ? member.institution[0] : member.institution;
    return { ...(institution as Record<string, unknown>), network_role: member.network_role, sort_order: member.sort_order };
  }).filter(Boolean).sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(a.sort_order) - Number(b.sort_order));
  return { ...network, community, institutions, primary_practitioner_id: data.primary_practitioner_id };
}

export async function getVerifiedSchedules(params: {
  supabase: TypedSupabaseClient;
  institutionIds: string[];
  from?: string;
  to?: string;
  limit?: number;
}) {
  if (!params.institutionIds.length) return [];
  let query = params.supabase.from("practitioner_schedules").select(`
    id,starts_at,ends_at,service_mode,location,registration_url,status,verified_at,note,
    institution:institutions!inner(id,name,institution_type),
    department:departments(id,name),
    practitioner:practitioners(id,name,title,specialties,avatar_url,introduction)
  `).in("institution_id", params.institutionIds).eq("status", "verified")
    .gte("ends_at", params.from ?? new Date().toISOString()).order("starts_at").limit(params.limit ?? 50);
  if (params.to) query = query.lte("starts_at", params.to);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPublishedContent(params: {
  supabase: TypedSupabaseClient;
  communityId?: string | null;
  category?: string | null;
  limit?: number;
}) {
  let query = params.supabase.from("content_items").select(`
    id,category,title,summary,cover_url,original_url,source_name,published_at,effective_from,expires_at,reviewed_at,
    institution:institutions(name)
  `).eq("status", "published").order("published_at", { ascending: false }).limit(params.limit ?? 30);
  if (params.communityId) query = query.or(`community_id.eq.${params.communityId},community_id.is.null`);
  if (params.category) query = query.eq("category", params.category);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

import type { NextRequest } from "next/server";
import { resolveResidentScope } from "@/lib/db/carePlatform";
import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { ProfileRow } from "@/lib/types";

export const CARE_SUBJECT_COOKIE = "jiayi_care_subject";

export type CareSubject = {
  residentId: string;
  displayName: string;
  relationship: string;
  isSelf: boolean;
  isPrimary: boolean;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function listCareSubjects(
  profile: ProfileRow,
  supabase: TypedSupabaseClient,
): Promise<CareSubject[]> {
  if (profile.role === "resident") {
    return [{
      residentId: profile.id,
      displayName: profile.display_name,
      relationship: "本人",
      isSelf: true,
      isPrimary: true,
    }];
  }

  if (profile.role !== "family") return [];

  const { data, error } = await supabase
    .from("family_bindings")
    .select("resident_id,relationship,is_primary,resident:profiles!family_bindings_resident_id_fkey(display_name)")
    .eq("family_id", profile.id)
    .eq("status", "active")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((binding: Record<string, unknown>) => {
    const resident = first(binding.resident as { display_name?: string } | Array<{ display_name?: string }> | null);
    return {
      residentId: String(binding.resident_id),
      displayName: resident?.display_name ?? "已绑定居民",
      relationship: String(binding.relationship || "家人"),
      isSelf: false,
      isPrimary: Boolean(binding.is_primary),
    };
  });
}

export async function resolveCareSubject(
  request: NextRequest,
  profile: ProfileRow,
  supabase: TypedSupabaseClient,
  explicitResidentId?: string | null,
) {
  const subjects = await listCareSubjects(profile, supabase);
  const requestedResidentId = explicitResidentId
    ?? request.cookies.get(CARE_SUBJECT_COOKIE)?.value
    ?? null;
  const residentId = await resolveResidentScope(profile, supabase, requestedResidentId);
  let selected = subjects.find((subject) => subject.residentId === residentId) ?? null;

  if (!selected) {
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", residentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    selected = {
      residentId,
      displayName: data?.display_name ?? "当前居民",
      relationship: "服务对象",
      isSelf: residentId === profile.id,
      isPrimary: true,
    };
  }

  return { residentId, selected, subjects };
}

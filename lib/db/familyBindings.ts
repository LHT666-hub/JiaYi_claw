import { TypedSupabaseClient } from "@/lib/supabase/types";
import { AppRole, FamilyBindingStatus, FamilyBindingView } from "@/lib/types";

type JoinedProfile = {
  id?: string | null;
  display_name?: string | null;
  role?: AppRole | null;
};

type JoinedFamilyBindingRow = {
  id: string;
  resident_id: string;
  family_id: string;
  relationship: string;
  note: string | null;
  is_primary: boolean;
  status: FamilyBindingStatus;
  created_at: string;
  updated_at: string;
  resident?: JoinedProfile | JoinedProfile[] | null;
  family?: JoinedProfile | JoinedProfile[] | null;
};

function firstProfile(value: JoinedProfile | JoinedProfile[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function mapFamilyBinding(row: JoinedFamilyBindingRow): FamilyBindingView {
  const resident = firstProfile(row.resident);
  const family = firstProfile(row.family);

  return {
    id: row.id,
    residentId: row.resident_id,
    familyId: row.family_id,
    residentName: resident?.display_name ?? "老人",
    familyName: family?.display_name ?? "家属",
    relationship: row.relationship,
    note: row.note ?? "",
    isPrimary: Boolean(row.is_primary),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const familyBindingSelect = `
  id,
  resident_id,
  family_id,
  relationship,
  note,
  is_primary,
  status,
  created_at,
  updated_at,
  resident:profiles!family_bindings_resident_id_fkey(id, display_name, role),
  family:profiles!family_bindings_family_id_fkey(id, display_name, role)
`;

export async function listFamilyBindingsForRole(
  profileId: string,
  role: AppRole,
  supabase: TypedSupabaseClient,
) {
  let query = supabase
    .from("family_bindings")
    .select(familyBindingSelect)
    .order("created_at", { ascending: false });

  if (role === "resident") {
    query = query.eq("resident_id", profileId);
  } else if (role === "family") {
    query = query.eq("family_id", profileId);
  } else if (role !== "admin") {
    return [];
  }

  const { data, error } = await query;
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load family bindings");
  }

  return (data as JoinedFamilyBindingRow[]).map(mapFamilyBinding);
}

export async function createFamilyBindingForAdmin({
  residentId,
  familyId,
  relationship,
  note,
  isPrimary,
  supabase,
}: {
  residentId: string;
  familyId: string;
  relationship: string;
  note?: string | null;
  isPrimary?: boolean;
  supabase: TypedSupabaseClient;
}) {
  const { data, error } = await supabase
    .from("family_bindings")
    .insert({
      resident_id: residentId,
      family_id: familyId,
      relationship,
      note: note || null,
      is_primary: Boolean(isPrimary),
      status: "active",
    })
    .select(familyBindingSelect)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create family binding");
  }

  return mapFamilyBinding(data as JoinedFamilyBindingRow);
}

export async function getActiveFamilyBindingsForResident(
  residentId: string,
  supabase: TypedSupabaseClient,
) {
  const { data, error } = await supabase
    .from("family_bindings")
    .select(familyBindingSelect)
    .eq("resident_id", residentId)
    .eq("status", "active")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [] as FamilyBindingView[];
  }

  return (data as JoinedFamilyBindingRow[]).map(mapFamilyBinding);
}

export async function updateFamilyBindingForAdmin({
  id,
  relationship,
  note,
  isPrimary,
  status,
  supabase,
}: {
  id: string;
  relationship?: string;
  note?: string | null;
  isPrimary?: boolean;
  status?: FamilyBindingStatus;
  supabase: TypedSupabaseClient;
}) {
  const payload: Record<string, string | boolean | null> = {};

  if (typeof relationship === "string") {
    payload.relationship = relationship;
  }
  if (typeof note === "string" || note === null) {
    payload.note = note || null;
  }
  if (typeof isPrimary === "boolean") {
    payload.is_primary = isPrimary;
  }
  if (status) {
    payload.status = status;
  }

  const { data, error } = await supabase
    .from("family_bindings")
    .update(payload)
    .eq("id", id)
    .select(familyBindingSelect)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update family binding");
  }

  return mapFamilyBinding(data as JoinedFamilyBindingRow);
}

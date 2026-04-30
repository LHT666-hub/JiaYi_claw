import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppRole, ProfileRow } from "@/lib/types";

export async function getServerAuthContext() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      supabase: null,
      user: null,
      profile: null as ProfileRow | null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      user: null,
      profile: null as ProfileRow | null,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, role, avatar_url, phone, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  return {
    supabase,
    user,
    profile: (profile as ProfileRow | null) ?? null,
  };
}

export function canAccessWorkbench(role?: AppRole | null) {
  return Boolean(
    role && ["doctor", "nurse", "pharmacist", "community", "admin"].includes(role),
  );
}

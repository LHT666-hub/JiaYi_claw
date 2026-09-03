import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/env";
import { AppRole, ProfileRow } from "@/lib/types";

export async function getServerAuthContext() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return { supabase: null, user: null, profile: null as ProfileRow | null };
  }
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
    .select(
      "id, display_name, role, avatar_url, phone, organization_id, community_id, account_status, onboarding_completed_at, preferred_language, created_at, updated_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  const activeProfile = profile?.account_status === "active" ? profile : null;
  return {
    supabase,
    user,
    profile: (activeProfile as ProfileRow | null) ?? null,
  };
}

export async function getApiAuthContext(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return { supabase: null, user: null, profile: null as ProfileRow | null };
  }
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const token = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    return getServerAuthContext();
  }

  if (!isSupabaseConfigured()) {
    return { supabase: null, user: null, profile: null as ProfileRow | null };
  }

  const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser(token);

  if (!user) {
    return { supabase, user: null, profile: null as ProfileRow | null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, display_name, role, avatar_url, phone, organization_id, community_id, account_status, onboarding_completed_at, preferred_language, created_at, updated_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  const activeProfile = profile?.account_status === "active" ? profile : null;
  return { supabase, user, profile: (activeProfile as ProfileRow | null) ?? null };
}

export function canAccessWorkbench(role?: AppRole | null) {
  return Boolean(
    role && ["doctor", "nurse", "pharmacist", "community", "admin"].includes(role),
  );
}

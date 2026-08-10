"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/supabase/mvp";
import type { ProfileRow } from "@/lib/types";
import { useDemoUser } from "@/lib/useDemoUser";

export function useCurrentProfile() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { currentUser, isReady: demoReady } = useDemoUser();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const demoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  useEffect(() => {
    let active = true;
    void (async () => {
      const remote = supabase ? await fetchCurrentProfile(supabase).catch(() => null) : null;
      if (!active) return;
      if (remote) setProfile(remote);
      else if (demoEnabled && demoReady && currentUser) setProfile({ id: currentUser.id, display_name: currentUser.name, role: currentUser.role, avatar_url: currentUser.avatarUrl ?? null, phone: null, organization_id: null, community_id: null, account_status: "active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      setLoading(false);
    })();
    return () => { active = false; };
  }, [currentUser, demoEnabled, demoReady, supabase]);
  return { profile, loading, isDemo: Boolean(demoEnabled && profile && !profile.organization_id) };
}

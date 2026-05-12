import { TypedSupabaseClient } from "@/lib/supabase/types";

export type GroupLeaderRow = {
  id: string;
  name: string;
  role_label: string;
  area: string | null;
  tags: string[];
  strengths: string[];
  suitable_for: string[];
  description: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LeaderMatchRow = {
  id: string;
  resident_id: string;
  leader_id: string;
  score: number;
  reasons: string[];
  needs: string[];
  is_selected: boolean;
  created_at: string;
};

export async function getActiveLeaders(supabase: TypedSupabaseClient) {
  try {
    const { data, error } = await supabase
      .from("group_leaders")
      .select("id, name, role_label, area, tags, strengths, suitable_for, description, avatar_url, is_active, created_at, updated_at")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error || !data) return [];
    return data as GroupLeaderRow[];
  } catch {
    return [];
  }
}

export async function getLeaderMatchesForResident(
  residentId: string,
  supabase: TypedSupabaseClient,
) {
  try {
    const { data, error } = await supabase
      .from("leader_matches")
      .select("id, resident_id, leader_id, score, reasons, needs, is_selected, created_at")
      .eq("resident_id", residentId)
      .order("score", { ascending: false });

    if (error || !data) return [];
    return data as LeaderMatchRow[];
  } catch {
    return [];
  }
}

export async function getSelectedLeaderMatch(
  residentId: string,
  supabase: TypedSupabaseClient,
) {
  try {
    const { data, error } = await supabase
      .from("leader_matches")
      .select("id, resident_id, leader_id, score, reasons, needs, is_selected, created_at")
      .eq("resident_id", residentId)
      .eq("is_selected", true)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as LeaderMatchRow;
  } catch {
    return null;
  }
}

export async function insertLeaderMatches(
  residentId: string,
  matches: { leaderId: string; score: number; reasons: string[]; needs: string[] }[],
  supabase: TypedSupabaseClient,
) {
  try {
    const rows = matches.map((m) => ({
      resident_id: residentId,
      leader_id: m.leaderId,
      score: m.score,
      reasons: m.reasons,
      needs: m.needs,
      is_selected: false,
    }));

    const { data, error } = await supabase
      .from("leader_matches")
      .insert(rows)
      .select();

    if (error || !data) return { ok: false, message: error?.message ?? "插入失败" };
    return { ok: true, matches: data as LeaderMatchRow[] };
  } catch {
    return { ok: false, message: "插入失败" };
  }
}

export async function selectLeader(
  residentId: string,
  matchId: string,
  supabase: TypedSupabaseClient,
) {
  try {
    // Deselect all existing selections for this resident
    await supabase
      .from("leader_matches")
      .update({ is_selected: false })
      .eq("resident_id", residentId)
      .eq("is_selected", true);

    // Select the specified match
    const { data, error } = await supabase
      .from("leader_matches")
      .update({ is_selected: true })
      .eq("id", matchId)
      .eq("resident_id", residentId)
      .select()
      .maybeSingle();

    if (error || !data) return { ok: false, message: error?.message ?? "选择失败" };
    return { ok: true, match: data as LeaderMatchRow };
  } catch {
    return { ok: false, message: "选择失败" };
  }
}

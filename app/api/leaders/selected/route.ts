import { NextResponse } from "next/server";
import { getSelectedLeaderMatch } from "@/lib/db/leaders";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function GET() {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置" }, { status: 401 });
  }

  let residentId: string | null = null;

  if (profile.role === "resident") {
    residentId = profile.id;
  } else if (profile.role === "family") {
    const { data } = (await supabase
      .from("family_bindings")
      .select("resident_id")
      .eq("family_id", profile.id)
      .eq("status", "active")
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle()) as { data: { resident_id: string } | null };

    residentId = data?.resident_id ?? null;
  }

  if (!residentId) {
    return NextResponse.json({ ok: true, leader: null });
  }

  const match = await getSelectedLeaderMatch(residentId, supabase);

  if (!match) {
    return NextResponse.json({ ok: true, leader: null });
  }

  const { data: leader } = (await supabase
    .from("group_leaders")
    .select("id, name, role_label, area, description, avatar_url")
    .eq("id", match.leader_id)
    .maybeSingle()) as {
    data: {
      id: string;
      name: string;
      role_label: string;
      area: string | null;
      description: string | null;
      avatar_url: string | null;
    } | null;
  };

  return NextResponse.json({
    ok: true,
    leader: leader
      ? {
          id: leader.id,
          name: leader.name,
          roleLabel: leader.role_label,
          area: leader.area,
          description: leader.description,
          avatarUrl: leader.avatar_url,
          matchPercent: match.score,
          reasons: match.reasons,
        }
      : null,
  });
}

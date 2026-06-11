import { NextRequest, NextResponse } from "next/server";
import { selectLeader } from "@/lib/db/leaders";
import { createNotification } from "@/lib/db/notifications";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json(
      { message: "当前未登录，或账号服务暂时不可用。" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    matchId?: string;
  };

  if (!body.matchId) {
    return NextResponse.json({ message: "缺少匹配记录 ID。" }, { status: 400 });
  }

  const result = await selectLeader(profile.id, body.matchId, supabase);

  if (!result.ok) {
    return NextResponse.json(
      { message: result.message ?? "选择小组长失败，请稍后再试。" },
      { status: 500 },
    );
  }

  try {
    const match = result.match;
    if (match) {
      const { data: leader } = (await supabase
        .from("group_leaders")
        .select("name, role_label, description, avatar_url")
        .eq("id", match.leader_id)
        .maybeSingle()) as {
        data: {
          name: string;
          role_label: string;
          description: string | null;
          avatar_url: string | null;
        } | null;
      };

      if (leader) {
        const { data: existingContact } = (await supabase
          .from("contacts")
          .select("id")
          .eq("resident_id", profile.id)
          .eq("name", leader.name)
          .eq("group_type", "community")
          .maybeSingle()) as { data: { id: string } | null };

        if (!existingContact) {
          await supabase.from("contacts").insert({
            resident_id: profile.id,
            name: leader.name,
            role_label: leader.role_label,
            group_type: "community" as const,
            description: leader.description,
            avatar_url: leader.avatar_url,
            sort_order: 0,
            is_primary: false,
          } as never);
        }
      }
    }
  } catch {
    // Best-effort; don't fail the selection
  }

  try {
    const leaderName = result.match
      ? await (async () => {
          const { data } = (await supabase
            .from("group_leaders")
            .select("name")
            .eq("id", result.match!.leader_id)
            .maybeSingle()) as { data: { name: string } | null };
          return data?.name ?? "小组长";
        })()
      : "小组长";

    await createNotification(
      {
        userId: profile.id,
        type: "leader_matched",
        title: `已匹配小组长：${leaderName}`,
        content: "您可以前往群聊，与小组长和邻里成员继续互动。",
        linkUrl: "/group",
      },
      supabase,
    );
  } catch {
    // best effort
  }

  return NextResponse.json({ ok: true, match: result.match });
}

import { NextResponse } from "next/server";
import { getContactsForResident, mapContactRowToContactItem } from "@/lib/db/contacts";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function GET() {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json(
      { message: "当前未登录，或账号服务暂时不可用。" },
      { status: 401 },
    );
  }

  let residentId: string | null = null;

  if (profile.role === "resident") {
    residentId = profile.id;
  } else if (profile.role === "family") {
    const { data } = (await supabase
      .from("contacts")
      .select("resident_id")
      .eq("contact_user_id", profile.id)
      .eq("group_type", "family")
      .limit(1)
      .maybeSingle()) as { data: { resident_id: string } | null };
    residentId = data?.resident_id ?? null;
  } else if (profile.role === "admin") {
    return NextResponse.json({ ok: true, contacts: [] });
  }

  if (!residentId) {
    return NextResponse.json({ ok: true, contacts: [] });
  }

  const contacts = await getContactsForResident(residentId, supabase);
  return NextResponse.json({
    ok: true,
    contacts: contacts.map(mapContactRowToContactItem),
  });
}

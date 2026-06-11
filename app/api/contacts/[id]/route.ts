import { NextRequest, NextResponse } from "next/server";
import { getContactsForResident, mapContactRowToContactItem } from "@/lib/db/contacts";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录。" }, { status: 401 });
  }

  const { id } = await context.params;
  const requestedId = id.trim();

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
    const residentQuery = await supabase
      .from("contacts")
      .select(
        "id, resident_id, contact_user_id, name, role_label, group_type, description, available_time, avatar_url, sort_order, created_at, updated_at",
      )
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    const residentContacts = (residentQuery.data ?? []).map(mapContactRowToContactItem);
    const contact = residentContacts.find((item) => item.id === requestedId) ?? null;
    return NextResponse.json({ ok: true, contact });
  }

  if (!residentId) {
    return NextResponse.json({ ok: true, contact: null });
  }

  const contacts = await getContactsForResident(residentId, supabase);
  const mapped = contacts.map(mapContactRowToContactItem);
  const contact = mapped.find((item) => item.id === requestedId) ?? null;

  return NextResponse.json({ ok: true, contact });
}

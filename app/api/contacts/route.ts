import { NextResponse } from "next/server";
import { getContactsForResident } from "@/lib/db/contacts";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function GET() {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json(
      { message: "当前未登录或 Supabase 未配置" },
      { status: 401 },
    );
  }

  // Resident reads own contacts; family reads linked contacts; admin reads all
  let residentId: string | null = null;

  if (profile.role === "resident") {
    residentId = profile.id;
  } else if (profile.role === "family") {
    // Look up which resident this family member is linked to
    const { data } = (await supabase
      .from("contacts")
      .select("resident_id")
      .eq("contact_user_id", profile.id)
      .eq("group_type", "family")
      .limit(1)
      .maybeSingle()) as { data: { resident_id: string } | null };
    residentId = data?.resident_id ?? null;
  } else if (profile.role === "admin") {
    // Admin can optionally pass ?residentId=...
    // For now, return empty — admin uses the dashboard
    return NextResponse.json({ ok: true, contacts: [] });
  }

  if (!residentId) {
    return NextResponse.json({ ok: true, contacts: [] });
  }

  const contacts = await getContactsForResident(residentId, supabase);
  return NextResponse.json({ ok: true, contacts });
}

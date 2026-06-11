import { NextRequest, NextResponse } from "next/server";
import { getContactsForResident, mapContactRowToContactItem } from "@/lib/db/contacts";
import { createNotification } from "@/lib/db/notifications";
import { getServerAuthContext } from "@/lib/supabase/server-auth";
import { ContactItem, NotificationType, ProfileRow } from "@/lib/types";

type ResolvedContact = {
  contact: ContactItem;
  contactUserId: string | null;
};

type ContactRequestMetadata = {
  kind: "contact_request";
  threadContactId: string;
  contactName: string;
  contactRole: string;
  requesterName: string;
  requesterRole: string;
  summary?: string;
};

async function resolveResidentId(
  profile: ProfileRow,
  supabase: NonNullable<Awaited<ReturnType<typeof getServerAuthContext>>["supabase"]>,
) {
  if (profile.role === "resident") {
    return profile.id;
  }

  if (profile.role === "family") {
    const { data } = (await supabase
      .from("contacts")
      .select("resident_id")
      .eq("contact_user_id", profile.id)
      .eq("group_type", "family")
      .limit(1)
      .maybeSingle()) as { data: { resident_id: string } | null };

    return data?.resident_id ?? null;
  }

  return null;
}

async function resolveContact(
  requestedId: string,
  profile: ProfileRow,
  supabase: NonNullable<Awaited<ReturnType<typeof getServerAuthContext>>["supabase"]>,
): Promise<ResolvedContact | null> {
  const residentId = await resolveResidentId(profile, supabase);

  if (!residentId) {
    return null;
  }

  const contacts = await getContactsForResident(residentId, supabase);
  const contactRow = contacts.find((item) => item.id === requestedId) ?? null;

  if (!contactRow) {
    return null;
  }

  return {
    contact: mapContactRowToContactItem(contactRow),
    contactUserId: contactRow.contact_user_id ?? null,
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录。" }, { status: 401 });
  }

  const { id } = await context.params;
  const requestedId = id.trim();
  const resolved = await resolveContact(requestedId, profile, supabase);

  if (!resolved) {
    return NextResponse.json({ message: "没有找到这个联系人。" }, { status: 404 });
  }

  if (!resolved.contactUserId) {
    return NextResponse.json(
      { message: "这位联系人暂未开通在线联系。" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { summary?: string };
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";

  const metadata: ContactRequestMetadata = {
    kind: "contact_request",
    threadContactId: requestedId,
    contactName: resolved.contact.name,
    contactRole: resolved.contact.role,
    requesterName: profile.display_name,
    requesterRole: profile.role,
    summary: summary || undefined,
  };

  const recipientResult = await createNotification(
    {
      userId: resolved.contactUserId,
      actorId: profile.id,
      type: "system" satisfies NotificationType,
      title: `${profile.display_name} 希望您主动联系`,
      content:
        summary ||
        `${profile.display_name} 发起了联系请求，请您在方便时尽快跟进。`,
      linkUrl: "/notifications",
      metadata,
    },
    supabase,
  );

  if (!recipientResult.ok) {
    return NextResponse.json(
      { message: recipientResult.message ?? "联系请求发送失败。" },
      { status: 500 },
    );
  }

  await createNotification(
    {
      userId: profile.id,
      actorId: profile.id,
      type: "system" satisfies NotificationType,
      title: `已向 ${resolved.contact.name} 发送联系请求`,
      content:
        summary || "对方收到提醒后，可从通知中心查看并联系您。",
      linkUrl: `/contacts/${requestedId}`,
      metadata,
    },
    supabase,
  );

  return NextResponse.json({ ok: true });
}

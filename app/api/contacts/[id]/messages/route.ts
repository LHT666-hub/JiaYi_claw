import { NextRequest, NextResponse } from "next/server";
import { createNotification, getNotifications } from "@/lib/db/notifications";
import { getServerAuthContext } from "@/lib/supabase/server-auth";
import { ContactItem, NotificationType, ProfileRow } from "@/lib/types";
import { getContactsForResident, mapContactRowToContactItem } from "@/lib/db/contacts";

type DirectMessageMetadata = {
  kind: "direct_message";
  threadContactId: string;
  counterpartyUserId: string | null;
  contactName: string;
  contactRole: string;
  direction: "incoming" | "outgoing";
  authorName: string;
  authorRole: string;
};

type ResolvedContact = {
  contact: ContactItem;
  residentId: string;
  contactUserId: string | null;
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
    residentId,
    contactUserId: contactRow.contact_user_id ?? null,
  };
}

function isDirectMessageMetadata(value: unknown): value is DirectMessageMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const metadata = value as Partial<DirectMessageMetadata>;
  return metadata.kind === "direct_message" && typeof metadata.threadContactId === "string";
}

function buildIncomingRole(contact: ContactItem) {
  if (contact.id.includes("doctor")) {
    return "doctor" as const;
  }

  if (contact.id.includes("nurse")) {
    return "nurse" as const;
  }

  if (contact.group === "family") {
    return "family" as const;
  }

  return "leader" as const;
}

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
  const resolved = await resolveContact(requestedId, profile, supabase);

  if (!resolved) {
    return NextResponse.json({
      ok: true,
      messages: [],
      canSend: false,
      reason: "contact_not_found",
    });
  }

  const canSend = Boolean(resolved.contactUserId);
  const notifications = await getNotifications(profile.id, supabase, { limit: 100 });
  const directNotifications = notifications
    .filter((item) => item.type === "system")
    .flatMap((item) => {
      if (!isDirectMessageMetadata(item.metadata)) {
        return [];
      }

      return [{ item, metadata: item.metadata }];
    })
    .filter(({ metadata }) => metadata.threadContactId === requestedId);

  const messages = directNotifications
    .map(({ item, metadata }) => ({
      id: item.id,
      author:
        metadata.direction === "outgoing" ? profile.display_name : metadata.authorName || resolved.contact.name,
      role: metadata.direction === "outgoing" ? ("user" as const) : buildIncomingRole(resolved.contact),
      content: item.content,
      createdAt: item.created_at,
      context: "direct" as const,
      threadId: requestedId,
    }))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  return NextResponse.json({
    ok: true,
    messages,
    canSend,
    reason: canSend ? null : "contact_unavailable",
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ messageText: "当前未登录。" }, { status: 401 });
  }

  const { id } = await context.params;
  const requestedId = id.trim();
  const resolved = await resolveContact(requestedId, profile, supabase);

  if (!resolved) {
    return NextResponse.json({ messageText: "没有找到这个联系人。" }, { status: 404 });
  }

  if (!resolved.contactUserId) {
    return NextResponse.json({ messageText: "该联系人暂未开通在线留言。" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { content?: string };
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!content) {
    return NextResponse.json({ messageText: "消息内容不能为空。" }, { status: 400 });
  }

  const outgoingMetadata: DirectMessageMetadata = {
    kind: "direct_message",
    threadContactId: requestedId,
    counterpartyUserId: resolved.contactUserId,
    contactName: resolved.contact.name,
    contactRole: resolved.contact.role,
    direction: "outgoing",
    authorName: profile.display_name,
    authorRole: profile.role,
  };

  const incomingMetadata: DirectMessageMetadata = {
    ...outgoingMetadata,
    direction: "incoming",
  };

  const senderResult = await createNotification(
    {
      userId: profile.id,
      actorId: profile.id,
      type: "system" satisfies NotificationType,
      title: `发给 ${resolved.contact.name} 的新消息`,
      content,
      linkUrl: `/contacts/${requestedId}/message`,
      metadata: outgoingMetadata,
    },
    supabase,
  );

  if (!senderResult.ok || !senderResult.notification) {
    return NextResponse.json({ messageText: senderResult.message ?? "留言发送失败。" }, { status: 500 });
  }

  await createNotification(
    {
      userId: resolved.contactUserId,
      actorId: profile.id,
      type: "system" satisfies NotificationType,
      title: `${profile.display_name} 发来一条新消息`,
      content,
      linkUrl: "/notifications",
      metadata: incomingMetadata,
    },
    supabase,
  );

  return NextResponse.json({
    ok: true,
    message: {
      id: senderResult.notification.id,
      author: profile.display_name,
      role: "user",
      content,
      createdAt: senderResult.notification.created_at,
      context: "direct",
      threadId: requestedId,
    },
  });
}

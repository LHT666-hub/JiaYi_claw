import { appendLocalNotification } from "@/lib/storage";
import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { NotificationType } from "@/lib/types";

export type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  content: string;
  link_url: string | null;
  is_read: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type CreateNotificationPayload = {
  userId: string;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  content: string;
  linkUrl?: string | null;
  metadata?: Record<string, unknown>;
};

function normalizeNotificationRow(row: NotificationRow): NotificationRow {
  return {
    ...row,
    actor_id: row.actor_id ?? null,
    link_url: row.link_url ?? null,
    metadata:
      row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

export async function getNotifications(
  userId: string,
  supabase: TypedSupabaseClient,
  options?: { unreadOnly?: boolean; limit?: number },
) {
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (options?.unreadOnly) {
    query = query.eq("is_read", false);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = (await query) as {
    data: NotificationRow[] | null;
    error: { message?: string } | null;
  };

  if (error || !data) {
    return [];
  }

  return data.map(normalizeNotificationRow);
}

export async function getUnreadCount(
  userId: string,
  supabase: TypedSupabaseClient,
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) {
    return 0;
  }

  return count ?? 0;
}

export async function markNotificationRead(
  id: string,
  userId: string,
  supabase: TypedSupabaseClient,
) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true } as never)
    .eq("id", id)
    .eq("user_id", userId);

  return { ok: !error };
}

export async function markAllNotificationsRead(
  userId: string,
  supabase: TypedSupabaseClient,
) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true } as never)
    .eq("user_id", userId)
    .eq("is_read", false);

  return { ok: !error };
}

export async function createNotification(
  payload: CreateNotificationPayload,
  supabase: TypedSupabaseClient,
) {
  const { data, error } = (await supabase
    .from("notifications")
    .insert({
      user_id: payload.userId,
      actor_id: payload.actorId ?? null,
      type: payload.type,
      title: payload.title,
      content: payload.content,
      link_url: payload.linkUrl ?? null,
      metadata: payload.metadata ?? {},
    } as never)
    .select("*")
    .maybeSingle()) as {
    data: NotificationRow | null;
    error: { message?: string } | null;
  };

  return {
    ok: !error,
    notification: data ? normalizeNotificationRow(data) : null,
    message: error?.message,
  };
}

export async function createNotificationsBatch(
  items: CreateNotificationPayload[],
  supabase: TypedSupabaseClient,
) {
  if (!items.length) {
    return { ok: true };
  }

  const { error } = await supabase.from("notifications").insert(
    items.map((item) => ({
      user_id: item.userId,
      actor_id: item.actorId ?? null,
      type: item.type,
      title: item.title,
      content: item.content,
      link_url: item.linkUrl ?? null,
      metadata: item.metadata ?? {},
    })) as never,
  );

  return { ok: !error, message: error?.message };
}

export function createLocalNotificationFallback(payload: CreateNotificationPayload) {
  return appendLocalNotification({
    userId: payload.userId,
    actorId: payload.actorId ?? null,
    type: payload.type,
    title: payload.title,
    content: payload.content,
    linkUrl: payload.linkUrl ?? "",
    metadata: payload.metadata ?? {},
  });
}

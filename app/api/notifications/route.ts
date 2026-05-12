import { NextRequest, NextResponse } from "next/server";
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/db/notifications";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  const limitParam = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;

  const [notifications, unreadCount] = await Promise.all([
    getNotifications(profile.id, supabase, { unreadOnly, limit }),
    getUnreadCount(profile.id, supabase),
  ]);

  return NextResponse.json({
    ok: true,
    notifications,
    unreadCount,
  });
}

export async function PATCH(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    markAllRead?: boolean;
  };

  if (body.markAllRead) {
    const result = await markAllNotificationsRead(profile.id, supabase);
    return NextResponse.json({ ok: result.ok });
  }

  if (!body.id) {
    return NextResponse.json({ message: "缺少通知 ID" }, { status: 400 });
  }

  const result = await markNotificationRead(body.id, profile.id, supabase);
  return NextResponse.json({ ok: result.ok });
}

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    type?: string;
    title?: string;
    content?: string;
    linkUrl?: string;
    metadata?: Record<string, unknown>;
  };

  if (body.type !== "system") {
    return NextResponse.json(
      { message: "当前仅支持创建系统提醒" },
      { status: 403 },
    );
  }

  if (!body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json({ message: "缺少标题或内容" }, { status: 400 });
  }

  const result = await createNotification(
    {
      userId: profile.id,
      actorId: profile.id,
      type: "system",
      title: body.title.trim(),
      content: body.content.trim(),
      linkUrl: body.linkUrl?.trim() || null,
      metadata: body.metadata ?? {},
    },
    supabase,
  );

  return NextResponse.json({ ok: result.ok, notification: result.notification });
}

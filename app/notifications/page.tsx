"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronRight } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { getNotificationAccent, getNotificationLabel } from "@/lib/notificationLabels";
import { isAccountUser, resolveInitialUser } from "@/lib/onboarding";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  STORAGE_CHANGE_EVENT,
  ensureSeedNotifications,
  markAllLocalNotificationsRead,
  markLocalNotificationRead,
  readLocalNotifications,
} from "@/lib/storage";

type DisplayNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

type IdentityState = "loading" | "account" | "local" | "none";

const accentClassMap = {
  navy: "bg-[#EEF3F8] text-navy",
  sage: "bg-[#EAF1EF] text-sage",
  amber: "bg-[#FFF0DF] text-amber",
};

function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function resolveNotificationLabel(notif: DisplayNotification) {
  if (notif.type === "todo_status_changed" && typeof notif.metadata?.followupResponse === "string") {
    return "随访回执";
  }

  if (notif.type === "system" && notif.metadata?.kind === "direct_message") {
    return "在线留言";
  }

  if (notif.type === "system" && notif.metadata?.kind === "contact_request") {
    return "联系请求";
  }

  if (notif.type === "system" && notif.metadata?.kind === "feedback_submission") {
    return "体验反馈";
  }

  return getNotificationLabel(notif.type);
}

export default function NotificationsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [notifications, setNotifications] = useState<DisplayNotification[]>([]);
  const [isSupabaseMode, setIsSupabaseMode] = useState(false);
  const [identityState, setIdentityState] = useState<IdentityState>("loading");
  const [loading, setLoading] = useState(true);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=50");
      if (res.ok) {
        const data = (await res.json()) as {
          ok: boolean;
          notifications?: Array<{
            id: string;
            type: string;
            title: string;
            content: string;
            link_url: string | null;
            is_read: boolean;
            created_at: string;
            metadata?: Record<string, unknown> | null;
          }>;
        };

        if (data.ok && data.notifications) {
          setNotifications(
            data.notifications.map((item) => ({
              id: item.id,
              type: item.type,
              title: item.title,
              body: item.content,
              href: item.link_url ?? "",
              isRead: item.is_read,
              createdAt: item.created_at,
              metadata: item.metadata ?? null,
            })),
          );
          setIsSupabaseMode(true);
          setRemoteError(null);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Continue below.
    }

    if (identityState === "account") {
      setNotifications([]);
      setIsSupabaseMode(false);
      setRemoteError("当前账号的通知暂时还没同步成功，请稍后刷新再试。");
      setLoading(false);
      return;
    }

    ensureSeedNotifications();
    const local = readLocalNotifications();
    setNotifications(
      local.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.content,
        href: item.linkUrl,
        isRead: item.isRead,
        createdAt: item.createdAt,
        metadata: item.metadata ?? null,
      })),
    );
    setIsSupabaseMode(false);
    setRemoteError(null);
    setLoading(false);
  }, [identityState]);

  useEffect(() => {
    let active = true;

    async function bootstrapIdentity() {
      const user = await resolveInitialUser(supabase);

      if (!active) {
        return;
      }

      if (!user) {
        setIdentityState("none");
        setLoading(false);
        router.replace("/welcome");
        return;
      }

      setIdentityState(isAccountUser(user) ? "account" : "local");
    }

    void bootstrapIdentity();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  useEffect(() => {
    if (identityState === "loading" || identityState === "none") {
      return;
    }

    void loadNotifications();

    if (identityState === "local") {
      window.addEventListener(STORAGE_CHANGE_EVENT, loadNotifications);
      return () => {
        window.removeEventListener(STORAGE_CHANGE_EVENT, loadNotifications);
      };
    }
  }, [identityState, loadNotifications]);

  const unreadCount = notifications.filter((item) => !item.isRead).length;
  const todayNotifs = notifications.filter((item) => isToday(item.createdAt));
  const earlierNotifs = notifications.filter((item) => !isToday(item.createdAt));

  async function handleMarkAllRead() {
    if (isSupabaseMode) {
      try {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markAllRead: true }),
        });
      } catch {
        setRemoteError("通知已显示，但标记已读暂时没有同步成功。");
      }
    } else {
      markAllLocalNotificationsRead();
    }

    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
  }

  async function handleClick(notif: DisplayNotification) {
    if (!notif.isRead) {
      if (isSupabaseMode) {
        try {
          await fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: notif.id }),
          });
        } catch {
          setRemoteError("通知已打开，但已读状态暂时没有同步成功。");
        }
      } else {
        markLocalNotificationRead(notif.id);
      }

      setNotifications((prev) =>
        prev.map((item) => (item.id === notif.id ? { ...item, isRead: true } : item)),
      );
    }

    if (notif.href) {
      router.push(notif.href);
    }
  }

  function renderNotifCard(notif: DisplayNotification) {
    const accent = getNotificationAccent(notif.type);
    const label = resolveNotificationLabel(notif);

    return (
      <button
        key={notif.id}
        type="button"
        onClick={() => void handleClick(notif)}
        className={`flex w-full items-start justify-between rounded-[24px] border px-4 py-4 text-left transition active:scale-[0.98] ${
          notif.isRead
            ? "border-line/50 bg-surface-card/70"
            : "border-line/70 bg-surface-card shadow-soft"
        }`}
      >
        <div className="flex gap-3">
          <div
            className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${accentClassMap[accent]}`}
          >
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-[0.14em] text-navy/48">
                {label}
              </span>
              {!notif.isRead ? (
                <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-semibold text-white">
                  新
                </span>
              ) : null}
            </div>
            <p
              className={`mt-2 text-sm font-semibold ${notif.isRead ? "text-navy/70" : "text-navy"}`}
            >
              {notif.title}
            </p>
            {notif.body ? (
              <p
                className={`mt-2 text-sm leading-6 ${notif.isRead ? "text-navy/48" : "text-navy/62"}`}
              >
                {notif.body}
              </p>
            ) : null}
          </div>
        </div>
        {notif.href ? <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-navy/38" /> : null}
      </button>
    );
  }

  if (loading) {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="通知中心" subtitle="随访、群提醒和课程更新都会出现在这里。" />
          <SectionCard>
            <p className="text-sm text-navy/66">正在加载...</p>
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="通知中心" subtitle="随访、群提醒和课程更新都会出现在这里。" />

        {remoteError ? (
          <SectionCard>
            <div className="rounded-[22px] border border-amber/25 bg-[#FFF6EA] px-4 py-4">
              <p className="text-sm font-semibold text-navy">数据同步稍有延迟</p>
              <p className="mt-1 text-sm leading-6 text-navy/66">{remoteError}</p>
            </div>
          </SectionCard>
        ) : null}

        {unreadCount > 0 ? (
          <div className="flex items-center justify-between rounded-[22px] bg-surface-tint px-4 py-3">
            <p className="text-sm font-semibold text-navy">{unreadCount} 条未读通知</p>
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              className="rounded-full bg-navy/8 px-3 py-1.5 text-xs font-semibold text-navy/70 active:scale-95"
            >
              全部标为已读
            </button>
          </div>
        ) : null}

        {notifications.length === 0 ? (
          <SectionCard>
            <EmptyState
              title="暂时还没有通知"
              description={
                identityState === "account"
                  ? "等当前账号有新的提醒、服务更新或课程变动后，这里会自动显示。"
                  : "当有新的提醒、任务完成或积分变动时，通知会出现在这里。"
              }
            />
          </SectionCard>
        ) : (
          <>
            {todayNotifs.length > 0 ? (
              <SectionCard title="今天">
                <div className="space-y-3">{todayNotifs.map(renderNotifCard)}</div>
              </SectionCard>
            ) : null}

            {earlierNotifs.length > 0 ? (
              <SectionCard title="更早">
                <div className="space-y-3">{earlierNotifs.map(renderNotifCard)}</div>
              </SectionCard>
            ) : null}
          </>
        )}
      </div>
    </PhoneShell>
  );
}

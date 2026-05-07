"use client";

import { useRouter } from "next/navigation";
import { Bell, ChevronRight } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { notifications } from "@/data/notifications";
import { useClawState } from "@/lib/useClawState";

const accentClassMap = {
  navy: "bg-[#EEF3F8] text-navy",
  sage: "bg-[#EAF1EF] text-sage",
  amber: "bg-[#FFF0DF] text-amber",
};

export default function NotificationsPage() {
  const router = useRouter();
  const { state, markNotificationsRead } = useClawState();

  const unreadCount = notifications.filter(
    (item) => !state.readNotificationIds.includes(item.id),
  ).length;

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="通知中心" subtitle="随访、群提醒和小课堂更新都在这里" />

        {unreadCount > 0 ? (
          <div className="flex items-center justify-between rounded-[22px] bg-[#FAEEDB] px-4 py-3">
            <p className="text-sm font-semibold text-navy">
              {unreadCount} 条未读通知
            </p>
            <button
              type="button"
              onClick={() => markNotificationsRead(notifications.map((n) => n.id))}
              className="rounded-full bg-navy/8 px-3 py-1.5 text-xs font-semibold text-navy/70 active:scale-95"
            >
              全部标为已读
            </button>
          </div>
        ) : null}

        <SectionCard title="我的通知">
          <div className="space-y-3">
            {notifications.map((item) => {
              const isRead = state.readNotificationIds.includes(item.id);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    markNotificationsRead([item.id]);
                    router.push(item.href);
                  }}
                  className={`flex w-full items-start justify-between rounded-[24px] border px-4 py-4 text-left transition active:scale-[0.98] ${
                    isRead
                      ? "border-line/50 bg-[#FFF8ED]/70"
                      : "border-line/70 bg-[#FFF8ED] shadow-soft"
                  }`}
                >
                  <div className="flex gap-3">
                    <div
                      className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${accentClassMap[item.accent]}`}
                    >
                      <Bell className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold tracking-[0.14em] text-navy/48">
                          {item.category}
                        </span>
                        {!isRead ? (
                          <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-semibold text-white">
                            新
                          </span>
                        ) : null}
                      </div>
                      <p className={`mt-2 text-sm font-semibold ${isRead ? "text-navy/70" : "text-navy"}`}>
                        {item.title}
                      </p>
                      <p className={`mt-2 text-sm leading-6 ${isRead ? "text-navy/48" : "text-navy/62"}`}>
                        {item.description}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-navy/38" />
                </button>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}

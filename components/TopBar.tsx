"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { PointsBadge } from "@/components/PointsBadge";
import { useDemoUser } from "@/lib/useDemoUser";

type TopBarProps = {
  onBellClick: () => void;
  points: number;
  hasUnreadNotifications?: boolean;
};

export function TopBar({
  onBellClick,
  points,
  hasUnreadNotifications = false,
}: TopBarProps) {
  const { currentUser } = useDemoUser();
  const name = currentUser?.name ?? "用户";

  return (
    <div className="px-2 pt-6">
      <div className="grid grid-cols-[72px_1fr_72px] items-center gap-2">
        <Link
          href="/me"
          aria-label="进入我的"
          className="flex items-center gap-2"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-cream text-lg font-semibold text-navy shadow-soft">
            {name.slice(0, 1)}
          </div>
        </Link>

        <div className="text-center">
          <p className="font-brand text-[1.7rem] font-semibold leading-none text-navy">
            家医 Claw
          </p>
          <p className="mt-2 text-xs tracking-[0.12em] text-navy/55">
            今日健康助手
          </p>
          <div className="mt-2 flex justify-center">
            <PointsBadge points={points} className="px-3 py-1.5 text-xs" />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onBellClick}
            className="relative flex h-11 w-11 items-center justify-center rounded-full border border-line bg-cream text-navy shadow-soft transition active:scale-95"
            aria-label="查看提醒"
          >
            <Bell className="h-5 w-5" strokeWidth={2.1} />
            {hasUnreadNotifications ? (
              <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-danger" />
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { PointsBadge } from "@/components/PointsBadge";

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
  return (
    <div className="flex items-center justify-between px-5 pt-8">
      <Link href="/me" className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-cream text-lg font-semibold text-navy shadow-soft">
          张
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-navy">张阿姨</p>
            <PointsBadge points={points} className="scale-90" />
          </div>
          <p className="text-xs text-navy/58">我的入口</p>
        </div>
      </Link>

      <div className="text-center">
        <p className="font-brand text-[1.45rem] font-semibold text-navy">家医 Claw</p>
        <p className="text-xs tracking-[0.14em] text-navy/60">问问题、找家医、记用药</p>
      </div>

      <button
        type="button"
        onClick={onBellClick}
        className="relative flex h-12 w-12 items-center justify-center rounded-full border border-line bg-cream text-navy shadow-soft transition hover:-translate-y-0.5"
        aria-label="查看提醒"
      >
        <Bell className="h-5 w-5" strokeWidth={2.1} />
        {hasUnreadNotifications ? (
          <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-danger" />
        ) : null}
        <ChevronRight className="absolute hidden" />
      </button>
    </div>
  );
}

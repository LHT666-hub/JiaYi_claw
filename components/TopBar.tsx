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
    <div className="px-5 pt-8">
      <div className="grid grid-cols-[56px_1fr_56px] items-start gap-3">
        <Link
          href="/me"
          aria-label="进入我的"
          className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-cream text-[1.9rem] font-semibold text-navy shadow-soft transition hover:-translate-y-0.5"
        >
          张
        </Link>

        <div className="min-w-0 text-center">
          <p className="font-brand text-[1.8rem] font-semibold leading-none text-navy">
            家医 Claw
          </p>
          <p className="mt-2 text-xs tracking-[0.12em] text-navy/62">
            问问题、找家医、记用药
          </p>
          <div className="mt-3 flex justify-center">
            <PointsBadge points={points} className="px-3.5 py-1.5 text-sm" />
          </div>
        </div>

        <button
          type="button"
          onClick={onBellClick}
          className="relative flex h-14 w-14 items-center justify-center justify-self-end rounded-full border border-line bg-cream text-navy shadow-soft transition hover:-translate-y-0.5"
          aria-label="查看提醒"
        >
          <Bell className="h-5 w-5" strokeWidth={2.1} />
          {hasUnreadNotifications ? (
            <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-danger" />
          ) : null}
          <ChevronRight className="absolute hidden" />
        </button>
      </div>
    </div>
  );
}

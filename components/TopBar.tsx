"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { PointsBadge } from "@/components/PointsBadge";

type TopBarProps = {
  name: string;
  onBellClick: () => void;
  points?: number;
  hasUnreadNotifications?: boolean;
};

export function TopBar({
  name,
  onBellClick,
  points,
  hasUnreadNotifications = false,
}: TopBarProps) {
  return (
    <div className="px-2 pt-7">
      <div className="grid grid-cols-[48px_minmax(0,1fr)_48px] items-center gap-2 pb-2">
        <Link
          href="/me"
          aria-label="进入我的"
          className="flex items-center gap-2"
        >
          <div className="ios-control flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-navy">
            {name.slice(0, 1)}
          </div>
        </Link>

        <div className="text-center">
          <h1 className="font-brand text-[28px] font-bold leading-tight text-navy">
            家医 Claw
          </h1>
          {typeof points === "number" ? <div className="mt-2 flex justify-center"><PointsBadge points={points} className="px-3 py-1.5 text-xs" /></div> : null}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onBellClick}
            className="ios-control relative flex h-11 w-11 items-center justify-center rounded-full text-navy transition active:scale-95"
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

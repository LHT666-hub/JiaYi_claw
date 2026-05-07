"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, House, MessageCircleMore } from "lucide-react";

const navItems = [
  { href: "/tasks", label: "任务", icon: ClipboardList },
  { href: "/", label: "首页", icon: House },
  { href: "/group", label: "群聊", icon: MessageCircleMore },
];

export function BottomNav() {
  const pathname = usePathname();
  const isHomeBranch =
    pathname === "/" ||
    pathname.startsWith("/ask") ||
    pathname.startsWith("/contacts") ||
    pathname.startsWith("/courses") ||
    pathname.startsWith("/me");

  return (
    <nav className="absolute inset-x-0 bottom-0 z-20 px-4 pb-5 pt-3">
      <div className="rounded-[30px] border border-line/75 bg-[#F7E8D4]/96 px-3 py-3 shadow-soft backdrop-blur-sm">
        <div className="grid grid-cols-3 gap-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? isHomeBranch
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-[24px] px-3 py-3 transition active:scale-95 ${
                  isActive
                    ? "-translate-y-1 bg-navy text-white shadow-soft"
                    : "bg-[#F2E2CA]/78 text-[#5E7690] hover:bg-[#EDD9C0]/90"
                }`}
              >
                <Icon
                  className={isActive ? "h-[22px] w-[22px] transition" : "h-5 w-5 transition"}
                  strokeWidth={2.1}
                />
                <span className={`text-xs font-semibold ${isActive ? "tracking-[0.12em]" : ""}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ClipboardList, House, MessageCircleMore, Settings, Users } from "lucide-react";
import { useDemoUser } from "@/lib/useDemoUser";

const residentNavItems = [
  { href: "/tasks", label: "任务", icon: ClipboardList },
  { href: "/", label: "首页", icon: House },
  { href: "/group", label: "群聊", icon: MessageCircleMore },
];

export function BottomNav() {
  const pathname = usePathname();
  const { currentUser } = useDemoUser();
  const role = currentUser?.role ?? "resident";
  const navItems =
    role === "family"
      ? [
          { href: "/family", label: "老人提醒", icon: Bell },
          { href: "/", label: "首页", icon: House },
          { href: "/contacts", label: "一键找人", icon: Users },
        ]
      : role === "admin"
        ? [
            { href: "/admin", label: "看板", icon: ClipboardList },
            { href: "/", label: "首页", icon: House },
            { href: "/me", label: "设置", icon: Settings },
          ]
        : ["doctor", "nurse", "pharmacist", "community"].includes(role)
          ? [
              { href: "/doctor", label: "待办", icon: ClipboardList },
              { href: "/", label: "首页", icon: House },
              { href: "/notifications", label: "消息", icon: Bell },
            ]
          : residentNavItems;
  const homeBranchPrefixes = ["/ask", "/courses", "/me", "/demo-center"];
  const isHomeBranch =
    pathname === "/" ||
    homeBranchPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    (role !== "family" && pathname.startsWith("/contacts")) ||
    (role === "family" && pathname.startsWith("/family"));

  return (
    <nav className="absolute inset-x-0 bottom-0 z-20 px-4 pb-5 pt-3">
      <div className="rounded-[32px] border border-white/55 bg-surface-nav/78 px-3 py-3 shadow-[0_18px_44px_rgba(16,42,67,0.14),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-2xl">
        <div className="grid grid-cols-3 gap-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? isHomeBranch
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className={`flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-[24px] px-3 py-3 transition active:scale-95 ${
                  isActive
                    ? "-translate-y-1 bg-navy text-white shadow-[0_14px_26px_rgba(16,42,67,0.2)]"
                    : "bg-white/28 text-[#5E7690] hover:bg-white/46"
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

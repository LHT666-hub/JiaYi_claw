"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, MessageCircleMore, Settings, Sparkles } from "lucide-react";

const navItems = [
  { href: "/", label: "首页", icon: House },
  { href: "/services", label: "服务", icon: Sparkles },
  { href: "/messages", label: "消息", icon: MessageCircleMore },
  { href: "/me", label: "我的", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  const homeBranchPrefixes = ["/ask"];
  const isHomeBranch =
    pathname === "/" ||
    homeBranchPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    pathname.startsWith("/contacts") || pathname.startsWith("/family");

  return (
    <nav className="phone-bottom-nav absolute inset-x-0 bottom-0 z-20 pt-3">
      <div className="rounded-[32px] border border-white/55 bg-surface-nav/78 px-2.5 py-3 shadow-[0_18px_44px_rgba(16,42,67,0.14),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-2xl">
        <div className="grid grid-cols-4 gap-1.5">
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
                className={`flex min-h-[62px] flex-col items-center justify-center gap-1.5 rounded-[22px] px-1 py-2.5 transition active:scale-95 ${
                  isActive
                    ? "-translate-y-1 bg-navy text-white shadow-[0_14px_26px_rgba(16,42,67,0.2)]"
                    : "bg-white/28 text-[#5E7690] hover:bg-white/46"
                }`}
              >
                <Icon
                  className={isActive ? "h-[22px] w-[22px] transition" : "h-5 w-5 transition"}
                  strokeWidth={2.1}
                />
                <span className={`text-[11px] font-semibold ${isActive ? "tracking-[0.08em]" : ""}`}>
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

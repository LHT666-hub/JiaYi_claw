"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ClipboardList, House, Settings, ShieldCheck, Stethoscope } from "lucide-react";

const links = [
  { href: "/doctor", label: "今日总览", icon: House },
  { href: "/workbench/requests", label: "服务队列", icon: ClipboardList },
  { href: "/workbench/operations", label: "运营协同", icon: Settings },
] as const;

export function WorkbenchHeader({
  title,
  subtitle,
  profile,
  actions,
}: {
  title: string;
  subtitle: string;
  profile?: { displayName?: string; role?: string } | null;
  actions?: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur-xl">
      <div className="mx-auto max-w-[1500px] px-5">
        <div className="flex min-h-16 items-center gap-5">
          <Link href="/doctor" className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-navy text-white shadow-[0_8px_20px_rgba(16,42,67,0.16)]"><Stethoscope className="h-[18px] w-[18px]" /></span>
            <span className="hidden text-sm font-semibold text-navy sm:block">家医 Claw</span>
          </Link>
          <nav className="hidden h-16 items-stretch gap-1 md:flex">
            {links.map((item) => {
              const active = pathname === item.href;
              return <Link key={item.href} href={item.href} className={`relative flex items-center gap-2 px-3 text-sm font-semibold ${active ? "text-navy" : "text-navy/48 hover:text-navy/75"}`}><item.icon className="h-4 w-4" />{item.label}{active ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-sage" /> : null}</Link>;
            })}
          </nav>
          <div className="min-w-0 flex-1 border-l border-line pl-4">
            <h1 className="truncate text-base font-semibold text-navy">{title}</h1>
            <p className="mt-0.5 truncate text-xs text-navy/45">{subtitle}</p>
          </div>
          {actions}
          {profile ? <div className="hidden items-center gap-2 border-l border-line pl-4 lg:flex"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-health-soft text-xs font-semibold text-sage">{profile.displayName?.slice(0, 1) ?? "医"}</span><div><p className="text-xs font-semibold text-navy">{profile.displayName ?? "团队成员"}</p><p className="mt-0.5 text-[10px] text-navy/40">{profile.role ?? "staff"}</p></div></div> : <ShieldCheck className="h-4 w-4 text-navy/25" />}
        </div>
        <nav className="flex gap-1 overflow-x-auto pb-2 md:hidden">
          {links.map((item) => <Link key={item.href} href={item.href} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold ${pathname === item.href ? "bg-navy text-white" : "bg-[#F3F6F5] text-navy/55"}`}><item.icon className="h-3.5 w-3.5" />{item.label}</Link>)}
        </nav>
      </div>
    </header>
  );
}

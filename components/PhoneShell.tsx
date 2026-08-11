"use client";

import { BottomNav } from "@/components/BottomNav";
import { usePathname } from "next/navigation";

type PhoneShellProps = {
  children: React.ReactNode;
  showBottomNav?: boolean;
};

export function PhoneShell({ children, showBottomNav = false }: PhoneShellProps) {
  const pathname = usePathname();
  const shouldHideBottomNav = pathname === "/group";
  const shouldShowBottomNav = showBottomNav && !shouldHideBottomNav;

  return (
    <main className="mx-auto flex min-h-dvh w-full items-center justify-center overflow-x-hidden px-3 py-3 sm:px-6 sm:py-6">
      <div className="relative h-[calc(100dvh-1.5rem)] w-full max-w-[430px] overflow-hidden rounded-[42px] border border-line/80 bg-cream shadow-[0_28px_70px_rgba(16,42,67,0.16),inset_0_1px_0_rgba(255,255,255,0.9)] sm:max-h-[920px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-3">
          <div className="h-1.5 w-[72px] rounded-full bg-navy/16 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)]" />
        </div>
        <div
          className={`resident-ui phone-scroll h-full min-h-0 overflow-y-auto overscroll-contain ${
            shouldShowBottomNav ? "pb-32" : "pb-8"
          }`}
        >
          {children}
        </div>
        {shouldShowBottomNav ? <BottomNav /> : null}
      </div>
    </main>
  );
}

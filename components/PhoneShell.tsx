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
    <main className="mx-auto flex min-h-dvh w-full items-center justify-center px-3 py-3 sm:px-6 sm:py-6">
      <div className="relative h-[calc(100dvh-1.5rem)] w-full max-w-[430px] overflow-hidden rounded-[40px] border border-[#E6CFB1] bg-paper shadow-float sm:max-h-[920px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-3">
          <div className="h-1.5 w-20 rounded-full bg-navy/18" />
        </div>
        <div
          className={`phone-scroll h-full min-h-0 overflow-y-auto overscroll-contain ${
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

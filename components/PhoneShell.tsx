"use client";

import { BottomNav } from "@/components/BottomNav";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  GlobalClawAssistant,
  type ClawAppointmentDraft,
} from "@/components/GlobalClawAssistant";

type PhoneShellProps = {
  children: React.ReactNode;
  showBottomNav?: boolean;
  contentMode?: "scroll" | "fixed";
  onClawAppointmentDraft?: (draft: ClawAppointmentDraft) => void;
};

export function PhoneShell({
  children,
  showBottomNav = false,
  contentMode = "scroll",
  onClawAppointmentDraft,
}: PhoneShellProps) {
  const pathname = usePathname();
  const [visualHeight, setVisualHeight] = useState<number | null>(null);
  const shouldHideBottomNav = pathname === "/group";
  const shouldShowBottomNav = showBottomNav && !shouldHideBottomNav;

  useEffect(() => {
    if (contentMode !== "fixed") return;
    const viewport = window.visualViewport;
    const updateHeight = () =>
      setVisualHeight(Math.round(viewport?.height ?? window.innerHeight));
    updateHeight();
    viewport?.addEventListener("resize", updateHeight);
    viewport?.addEventListener("scroll", updateHeight);
    window.addEventListener("resize", updateHeight);
    return () => {
      viewport?.removeEventListener("resize", updateHeight);
      viewport?.removeEventListener("scroll", updateHeight);
      window.removeEventListener("resize", updateHeight);
    };
  }, [contentMode]);

  const fixedViewportStyle =
    contentMode === "fixed" && visualHeight
      ? { height: `${visualHeight}px`, minHeight: `${visualHeight}px` }
      : undefined;
  return (
    <main
      style={fixedViewportStyle}
      className={`phone-shell-stage mx-auto flex w-full items-center justify-center overflow-hidden sm:px-6 sm:py-6 ${contentMode === "fixed" ? "h-dvh min-h-0" : "min-h-dvh"}`}
    >
      <div
        className={`phone-shell-frame relative w-full max-w-[430px] overflow-hidden border border-line/80 bg-cream shadow-[0_28px_70px_rgba(16,42,67,0.16),inset_0_1px_0_rgba(255,255,255,0.9)] sm:max-h-[920px] ${contentMode === "fixed" ? "h-full" : "h-[calc(100dvh-1.5rem)]"}`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-3">
          <div className="h-1.5 w-[72px] rounded-full bg-navy/16 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)]" />
        </div>
        <div
          className={`resident-ui phone-scroll h-full min-h-0 overscroll-contain ${
            contentMode === "fixed"
              ? "overflow-hidden"
              : `overflow-y-auto ${shouldShowBottomNav ? "pb-32" : "pb-8"}`
          }`}
        >
          {children}
        </div>
        {shouldShowBottomNav ? <BottomNav /> : null}
        {shouldShowBottomNav ? (
          <GlobalClawAssistant onAppointmentDraft={onClawAppointmentDraft} />
        ) : null}
      </div>
    </main>
  );
}

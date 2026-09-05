"use client";

import { useEffect } from "react";
import { triggerHaptic, type HapticKind } from "@/lib/haptics";

const primaryRoutes = new Set(["/", "/services", "/messages", "/me"]);

export function MotionFeedbackProvider() {
  useEffect(() => {
    const root = document.documentElement;

    const handlePointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const hapticTarget = target.closest<HTMLElement>("[data-haptic]");
      if (hapticTarget && !hapticTarget.matches(":disabled, [aria-disabled='true']")) {
        triggerHaptic((hapticTarget.dataset.haptic as HapticKind | undefined) ?? "light");
      }

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank") return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      root.dataset.navDirection =
        anchor.dataset.navKind === "tab" || primaryRoutes.has(destination.pathname)
          ? "tab"
          : "forward";
    };

    const handlePopState = () => {
      root.dataset.navDirection = "back";
    };

    document.addEventListener("pointerup", handlePointer, true);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("pointerup", handlePointer, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return null;
}

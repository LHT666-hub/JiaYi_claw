"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type BackHeaderProps = {
  title: string;
  subtitle?: string;
  sticky?: boolean;
  backHref?: string;
};

export function BackHeader({ title, subtitle, sticky = false, backHref }: BackHeaderProps) {
  const router = useRouter();

  return (
    <div
      className={`resident-page-header flex items-center gap-3 px-1 pb-2 pt-7 ${
        sticky
          ? "sticky top-0 z-20 -mx-4 border-b border-white/45 bg-surface-nav/82 px-5 pb-3 pt-8 shadow-[0_10px_28px_rgba(16,42,67,0.05)] backdrop-blur-2xl"
          : ""
      }`}
    >
      <button
        type="button"
        onClick={() => backHref ? router.push(backHref) : router.back()}
        className="ios-control mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-navy"
        aria-label="返回"
      >
        <ArrowLeft className="h-5 w-5" strokeWidth={2.1} />
      </button>
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm leading-6 text-navy/62">{subtitle}</p> : null}
      </div>
    </div>
  );
}

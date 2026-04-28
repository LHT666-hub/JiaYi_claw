"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type BackHeaderProps = {
  title: string;
  subtitle?: string;
};

export function BackHeader({ title, subtitle }: BackHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex items-start gap-4 px-5 pt-8">
      <button
        type="button"
        onClick={() => router.back()}
        className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-cream text-navy shadow-soft"
        aria-label="返回"
      >
        <ArrowLeft className="h-5 w-5" strokeWidth={2.1} />
      </button>
      <div>
        <h1 className="text-[1.5rem] font-semibold text-navy">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm leading-6 text-navy/62">{subtitle}</p> : null}
      </div>
    </div>
  );
}

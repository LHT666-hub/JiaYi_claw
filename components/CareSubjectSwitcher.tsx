"use client";

import Link from "next/link";
import { Check, ChevronDown, UserRound, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { CareSubject } from "@/lib/careSubjects";

type CareSubjectResponse = {
  selected: CareSubject;
  subjects: CareSubject[];
};

type Props = {
  initialSelected?: CareSubject | null;
  initialSubjects?: CareSubject[];
  compact?: boolean;
};

export function CareSubjectSwitcher({
  initialSelected = null,
  initialSubjects = [],
  compact = false,
}: Props) {
  const [selected, setSelected] = useState<CareSubject | null>(initialSelected);
  const [subjects, setSubjects] = useState<CareSubject[]>(initialSubjects);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState("");
  const [needsBinding, setNeedsBinding] = useState(false);

  useEffect(() => {
    if (initialSelected) return;
    let active = true;
    void fetch("/api/v1/care-subject", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!active) return;
        if (response.status === 409) {
          setNeedsBinding(true);
          return;
        }
        if (!response.ok) return;
        const data = payload.data as CareSubjectResponse;
        setSelected(data.selected);
        setSubjects(data.subjects);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [initialSelected]);

  async function choose(subject: CareSubject) {
    if (subject.residentId === selected?.residentId) {
      setOpen(false);
      return;
    }
    setSwitching(subject.residentId);
    const response = await fetch("/api/v1/care-subject", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ residentId: subject.residentId }),
    });
    if (response.ok) {
      setSelected(subject);
      setOpen(false);
      window.location.reload();
      return;
    }
    setSwitching("");
  }

  if (needsBinding) {
    return (
      <Link
        href="/family-link"
        className="flex items-center justify-between rounded-[22px] border border-amber/20 bg-amber/10 px-4 py-3 text-sm text-navy"
      >
        <span>
          <strong>还没有服务对象</strong>
          <span className="ml-2 text-xs text-navy/50">请由居民本人授权</span>
        </span>
        <ChevronDown className="h-4 w-4 -rotate-90 text-navy/40" />
      </Link>
    );
  }

  if (!selected) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => subjects.length > 1 && setOpen((value) => !value)}
        className={`ios-control flex w-full items-center gap-3 text-left ${compact ? "rounded-full px-3 py-2" : "rounded-[22px] px-4 py-3"}`}
      >
        <span
          className={`flex shrink-0 items-center justify-center rounded-full bg-health-muted text-sage ${compact ? "h-9 w-9" : "h-11 w-11"}`}
        >
          {selected.isSelf ? (
            <UserRound className="h-4 w-4" />
          ) : (
            <UsersRound className="h-4 w-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-sage">
            当前服务对象
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-navy">
            {selected.displayName}
            <span className="ml-2 text-xs font-normal text-navy/45">
              {selected.isSelf ? "本人" : `${selected.relationship} · 代办`}
            </span>
          </span>
        </span>
        {subjects.length > 1 ? (
          <ChevronDown
            className={`h-4 w-4 text-navy/40 transition ${open ? "rotate-180" : ""}`}
          />
        ) : null}
      </button>

      {open ? (
        <div className="ios-material absolute inset-x-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-[24px] p-2 shadow-[0_22px_48px_rgba(16,42,67,0.18)]">
          <p className="px-3 pb-2 pt-1 text-[11px] font-semibold text-navy/40">
            选择本次咨询和办理的居民
          </p>
          {subjects.map((subject) => (
            <button
              type="button"
              key={subject.residentId}
              disabled={Boolean(switching)}
              onClick={() => void choose(subject)}
              className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition hover:bg-health-soft disabled:opacity-50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-icon text-sm font-semibold text-navy">
                {subject.displayName.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-navy">
                  {subject.displayName}
                </span>
                <span className="mt-0.5 block text-xs text-navy/45">
                  {subject.isSelf
                    ? "本人"
                    : `${subject.relationship} · 已授权代办`}
                </span>
              </span>
              {selected.residentId === subject.residentId ? (
                <Check className="h-4 w-4 text-success" />
              ) : null}
            </button>
          ))}
          <Link
            href="/family-link"
            className="mt-1 block rounded-[18px] px-3 py-3 text-center text-xs font-semibold text-sage hover:bg-health-soft"
          >
            管理家属授权
          </Link>
        </div>
      ) : null}
    </div>
  );
}

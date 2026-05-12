"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LucideIcon } from "lucide-react";
import { PointsBadge } from "@/components/PointsBadge";

type TaskCardProps = {
  title: string;
  description: string;
  points: number;
  icon: LucideIcon;
  completed?: boolean;
  onComplete?: () => void;
};

export function TaskCard({
  title,
  description,
  points,
  icon: Icon,
  completed = false,
  onComplete,
}: TaskCardProps) {
  const hasMounted = useRef(false);
  const [didAnimate, setDidAnimate] = useState(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    if (completed) {
      setDidAnimate(true);
      const timer = window.setTimeout(() => setDidAnimate(false), 760);
      return () => window.clearTimeout(timer);
    }
  }, [completed]);

  return (
    <div className="rounded-[24px] border border-line/70 bg-white/35 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-2xl transition ${
              completed ? "bg-[#DDEFE4] text-[#2F6C56]" : "bg-[#F7E7D4] text-navy"
            }`}
          >
            {completed ? (
              <Check className="h-5 w-5" strokeWidth={2.4} />
            ) : (
              <Icon className="h-5 w-5" strokeWidth={2.1} />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-navy">{title}</p>
            <p className="mt-1 text-xs leading-5 text-navy/62">{description}</p>
          </div>
        </div>
        <PointsBadge points={points} />
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onComplete}
          disabled={completed}
          className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
            completed
              ? `text-white ${didAnimate ? "animate-task-complete bg-[#2F6C56]" : "bg-[#3B7A61]"}`
              : "bg-navy text-white shadow-soft active:scale-95"
          }`}
        >
          {completed ? "已完成" : "完成"}
        </button>
      </div>
    </div>
  );
}

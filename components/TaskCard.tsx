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
  variant?: "default" | "plan";
};

export function TaskCard({
  title,
  description,
  points,
  icon: Icon,
  completed = false,
  onComplete,
  variant = "default",
}: TaskCardProps) {
  const hasMounted = useRef(false);
  const [didAnimate, setDidAnimate] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

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

  if (variant === "plan") {
    return (
      <div
        onPointerDown={() => setIsPressed(true)}
        onPointerUp={() => setIsPressed(false)}
        onPointerCancel={() => setIsPressed(false)}
        onPointerLeave={() => setIsPressed(false)}
        className="rounded-[24px] border p-4 transition duration-150 ease-out"
        style={{
          minHeight: 112,
          borderColor: "#E3D0B8",
          backgroundColor: isPressed ? "var(--surface-press)" : "var(--surface-input)",
          boxShadow: isPressed
            ? "0 4px 12px rgba(18, 50, 74, 0.03)"
            : "0 8px 20px rgba(18, 50, 74, 0.04)",
          transform: isPressed ? "scale(0.992)" : "scale(1)",
        }}
      >
        <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-3">
          <div
            className="flex h-[52px] w-[52px] items-center justify-center rounded-[18px] border"
            style={{
              backgroundColor: "#FAF0E2",
              borderColor: "#EBDCCA",
            }}
          >
            {completed ? (
              <Check className="h-[23px] w-[23px]" color="#12324A" strokeWidth={2} />
            ) : (
              <Icon className="h-[23px] w-[23px]" color="#12324A" strokeWidth={2} />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-col gap-1.5">
              <p
                className="line-clamp-2 text-[17px] font-bold leading-[1.3]"
                style={{ color: "#12324A" }}
              >
                {title}
              </p>
              <p
                className="line-clamp-2 text-[14px] leading-[1.45]"
                style={{ color: "#5F6B73" }}
              >
                {description}
              </p>
              <p className="text-[12px] leading-[1.35]" style={{ color: "#8A9197" }}>
                {completed ? "今日已完成" : "今日可完成"}
              </p>
            </div>
          </div>

          <div className="ml-2 flex shrink-0 flex-col items-end justify-center gap-2.5">
            <div
              className="inline-flex h-7 min-w-[46px] items-center justify-center whitespace-nowrap rounded-full border px-2.5 text-[14px] font-bold leading-none"
              style={{
                backgroundColor: "#FAF0E2",
                borderColor: "#EBDCCA",
                color: "#12324A",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {points}分
            </div>
            <button
              type="button"
              onClick={onComplete}
              disabled={completed}
              className="inline-flex h-[34px] min-w-[68px] items-center justify-center whitespace-nowrap rounded-full px-[14px] text-[14px] font-semibold transition duration-120"
              style={{
                backgroundColor: completed ? "#E7EFE9" : "#12324A",
                color: completed ? "#4E7D65" : "#FFF8EE",
                transform: "scale(1)",
              }}
              onPointerDown={(event) => {
                event.currentTarget.style.transform = "scale(0.98)";
                if (!completed) {
                  event.currentTarget.style.backgroundColor = "#0B2238";
                }
              }}
              onPointerUp={(event) => {
                event.currentTarget.style.transform = "scale(1)";
                event.currentTarget.style.backgroundColor = completed ? "#E7EFE9" : "#12324A";
              }}
              onPointerLeave={(event) => {
                event.currentTarget.style.transform = "scale(1)";
                event.currentTarget.style.backgroundColor = completed ? "#E7EFE9" : "#12324A";
              }}
              onPointerCancel={(event) => {
                event.currentTarget.style.transform = "scale(1)";
                event.currentTarget.style.backgroundColor = completed ? "#E7EFE9" : "#12324A";
              }}
            >
              {completed ? "已完成" : "完成"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-line/70 bg-white/35 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition ${
              completed ? "bg-health-success text-success" : "bg-[#F7E7D4] text-navy"
            }`}
          >
            {completed ? (
              <Check className="h-5 w-5" strokeWidth={2.4} />
            ) : (
              <Icon className="h-5 w-5" strokeWidth={2.1} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-navy">{title}</p>
            <p className="mt-1 text-xs leading-5 text-navy/62">{description}</p>
          </div>
        </div>
        <PointsBadge points={points} className="self-start" />
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onComplete}
          disabled={completed}
          className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
            completed
              ? `text-white ${didAnimate ? "animate-task-complete bg-success" : "bg-[#3B7A61]"}`
              : "bg-navy text-white shadow-soft active:scale-95"
          }`}
        >
          {completed ? "已完成" : "完成"}
        </button>
      </div>
    </div>
  );
}

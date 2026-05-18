import { Coins } from "lucide-react";

type PointsBadgeProps = {
  points: number;
  className?: string;
};

export function PointsBadge({ points, className = "" }: PointsBadgeProps) {
  return (
    <div
      className={`inline-flex h-7 min-w-[44px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-amber/20 bg-amber/10 px-2.5 py-1 text-sm font-semibold leading-none text-amber shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] ${className}`}
    >
      <Coins className="h-4 w-4 shrink-0" strokeWidth={2.1} />
      <span className="whitespace-nowrap">{points} 分</span>
    </div>
  );
}

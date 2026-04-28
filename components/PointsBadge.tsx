import { Coins } from "lucide-react";

type PointsBadgeProps = {
  points: number;
  className?: string;
};

export function PointsBadge({ points, className = "" }: PointsBadgeProps) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-amber/20 bg-[#FFF1DF] px-3 py-1.5 text-sm font-semibold text-amber ${className}`}
    >
      <Coins className="h-4 w-4" strokeWidth={2.1} />
      <span>{points} 分</span>
    </div>
  );
}

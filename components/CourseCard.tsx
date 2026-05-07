import { Headphones, PlayCircle } from "lucide-react";
import { CourseItem } from "@/lib/types";
import { PointsBadge } from "@/components/PointsBadge";

type CourseCardProps = {
  course: CourseItem;
  watched?: boolean;
  isActive?: boolean;
  canClaim?: boolean;
  onPlay: () => void;
  onListen: () => void;
  onClaim: () => void;
};

export function CourseCard({
  course,
  watched = false,
  isActive = false,
  canClaim = true,
  onPlay,
  onListen,
  onClaim,
}: CourseCardProps) {
  return (
    <div
      className={`rounded-[26px] border px-4 py-4 shadow-soft transition ${
        isActive ? "border-sage/60 bg-[#F7F3E8]" : "border-line/80 bg-cream"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-[#E9F0EE] px-2.5 py-1 text-sage">{course.category}</span>
            <span className="text-navy/55">{course.audience}</span>
          </div>
          <h3 className="text-base font-semibold text-navy">{course.title}</h3>
          <p className="mt-2 text-sm leading-6 text-navy/65">{course.summary}</p>
          <p className="mt-2 text-xs tracking-[0.14em] text-navy/48">{course.duration}</p>
        </div>
        <PointsBadge points={course.points} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onPlay}
          className="flex items-center justify-center gap-2 rounded-full bg-navy px-3 py-2.5 text-sm font-semibold text-white active:scale-95"
        >
          <PlayCircle className="h-4 w-4" />
          播放
        </button>
        <button
          type="button"
          onClick={onListen}
          className="flex items-center justify-center gap-2 rounded-full border border-line bg-[#FFF8EF] px-3 py-2.5 text-sm font-semibold text-navy active:scale-95"
        >
          <Headphones className="h-4 w-4" />
          听讲解
        </button>
        <button
          type="button"
          onClick={onClaim}
          disabled={watched || !canClaim}
          className={`rounded-full px-3 py-2.5 text-sm font-semibold transition active:scale-95 ${
            watched
              ? "bg-[#DDE7E0] text-[#5C746F]"
              : canClaim
                ? "bg-[#F2E2C7] text-navy"
                : "bg-[#F2E2C7]/60 text-navy/45"
          }`}
        >
          {watched ? "✓ 已领取" : canClaim ? "看完领积分" : "先去播放"}
        </button>
      </div>
    </div>
  );
}

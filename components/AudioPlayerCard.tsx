"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CourseItem } from "@/lib/types";
import { formatPlaybackTime, parseDurationLabel } from "@/lib/format";

type AudioPlayerCardProps = {
  course: CourseItem;
  mode: "play" | "listen";
  watched: boolean;
  remoteMode?: boolean;
  onClaim: () => void;
};

const barPattern = [18, 30, 22, 34, 16, 28, 20, 36, 24, 14, 32, 22, 30, 18, 26, 34];

export function AudioPlayerCard({
  course,
  mode,
  watched,
  remoteMode = false,
  onClaim,
}: AudioPlayerCardProps) {
  const duration = useMemo(() => parseDurationLabel(course.duration), [course.duration]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(mode === "play");

  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(mode === "play");
  }, [course.id, mode]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentTime((value) => {
        if (value >= duration) {
          window.clearInterval(timer);
          return duration;
        }

        return Math.min(duration, value + 1);
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [duration, isPlaying]);

  useEffect(() => {
    if (currentTime >= duration && isPlaying) {
      setIsPlaying(false);
    }
  }, [currentTime, duration, isPlaying]);

  const progress = duration === 0 ? 0 : currentTime / duration;
  const canClaim = watched || currentTime >= duration;
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const handleProgressClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressBarRef.current;

      if (!bar || duration === 0) return;

      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      setCurrentTime(Math.round(ratio * duration));
    },
    [duration],
  );

  function seek(delta: number) {
    setCurrentTime((value) => {
      const next = Math.min(duration, Math.max(0, value + delta));
      return next;
    });
  }

  function togglePlay() {
    if (currentTime >= duration) {
      setCurrentTime(0);
    }

    setIsPlaying((value) => !value);
  }

  return (
    <div className="rounded-[28px] bg-navy px-5 py-5 text-white shadow-float">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm tracking-[0.16em] text-white/72">
            {mode === "listen" ? "听讲解中" : "播放中"}
          </p>
          <h3 className="mt-3 text-lg font-semibold">{course.title}</h3>
          <p className="mt-2 text-sm leading-6 text-white/72">
            {remoteMode
              ? "播放完成后即可领取课程积分，学习记录会同步到当前账号。"
              : "播放完成后即可领取课程积分。当前设备上的学习记录只会保存在本机。"}
          </p>
        </div>
        <div className="rounded-full border border-white/18 px-3 py-1 text-xs text-white/75">
          {course.duration}
        </div>
      </div>

      <div className="mt-5 flex h-16 items-end gap-1 rounded-[22px] bg-white/8 px-3 py-3">
        {barPattern.map((height, index) => {
          const ratio = index / barPattern.length;
          const active = ratio <= progress;

          return (
            <span
              key={`${course.id}-${index}`}
              className={`wave-bar ${isPlaying && active ? "wave-bar-live" : ""}`}
              style={{
                height: `${height}px`,
                backgroundColor: active ? "rgba(243,221,194,0.9)" : "rgba(255,255,255,0.24)",
                animationDelay: `${index * 60}ms`,
              }}
            />
          );
        })}
      </div>

      <div className="mt-4">
        <div
          ref={progressBarRef}
          onClick={handleProgressClick}
          className="h-2 cursor-pointer rounded-full bg-white/16">
          <div
            className="h-2 rounded-full bg-[#F3DDC2] transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-white/72">
          <span>{formatPlaybackTime(currentTime)}</span>
          <span>{formatPlaybackTime(duration)}</span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => seek(-15)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10"
          >
            <span className="text-sm font-semibold text-white">-15</span>
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-navy shadow-soft"
          >
            <span className="text-sm font-semibold">{isPlaying ? "暂停" : "播放"}</span>
          </button>
          <button
            type="button"
            onClick={() => seek(15)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10"
          >
            <span className="text-sm font-semibold text-white">+15</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClaim}
          disabled={!canClaim || watched}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            watched
              ? "bg-[#DDE7E0] text-[#365B53]"
              : canClaim
                ? "bg-[#F3DDC2] text-navy"
                : "bg-white/14 text-white/65"
          }`}
        >
          {watched ? "已领取积分" : canClaim ? `领取 +${course.points} 分` : "播完后可领取"}
        </button>
      </div>
    </div>
  );
}

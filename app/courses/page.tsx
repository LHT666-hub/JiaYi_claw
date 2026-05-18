"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AudioPlayerCard } from "@/components/AudioPlayerCard";
import { BackHeader } from "@/components/BackHeader";
import { CourseCard } from "@/components/CourseCard";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import { STORAGE_CHANGE_EVENT, readMergedCourses } from "@/lib/storage";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ManagedCourseItem } from "@/lib/types";
import { useClawState } from "@/lib/useClawState";

const allCategoryLabel = "全部";

type CourseApiRow = {
  id: string;
  title: string;
  category: string;
  audience: string | null;
  summary: string | null;
  duration: string | null;
  points: number;
  video_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

function mapCourseRowToManaged(row: CourseApiRow): ManagedCourseItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    audience: row.audience ?? "",
    summary: row.summary ?? "",
    duration: row.duration ?? "",
    points: row.points,
    isActive: row.status === "published",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function CoursesPageContent() {
  const searchParams = useSearchParams();
  const handledInitial = useRef(false);
  const [activeCategory, setActiveCategory] = useState(allCategoryLabel);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState<"play" | "listen" | null>(null);
  const [courseItems, setCourseItems] = useState<ManagedCourseItem[]>([]);
  const [isSupabaseMode, setIsSupabaseMode] = useState(false);
  const { state, completeCourse } = useClawState();
  const { showToast } = useToast();

  useEffect(() => {
    // Start with local fallback
    setCourseItems(readMergedCourses());

    let active = true;

    async function loadRemoteCourses() {
      if (!isSupabaseConfigured()) return;

      try {
        const response = await fetch("/api/courses", { method: "GET", cache: "no-store" });
        const payload = (await response.json()) as { ok?: boolean; courses?: CourseApiRow[] };

        if (!active || !response.ok || !payload.ok || !payload.courses?.length) return;

        setCourseItems(payload.courses.map(mapCourseRowToManaged));
        setIsSupabaseMode(true);
      } catch {
        // Keep local fallback
      }
    }

    void loadRemoteCourses();

    function syncCourses() {
      if (!isSupabaseMode) {
        setCourseItems(readMergedCourses());
      }
    }

    window.addEventListener(STORAGE_CHANGE_EVENT, syncCourses);
    window.addEventListener("storage", syncCourses);

    return () => {
      active = false;
      window.removeEventListener(STORAGE_CHANGE_EVENT, syncCourses);
      window.removeEventListener("storage", syncCourses);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (handledInitial.current) {
      return;
    }

    handledInitial.current = true;

    const autoplay = searchParams.get("autoplay");
    const mode = searchParams.get("mode");

    if (autoplay) {
      setActiveCourseId(autoplay);
      setPlayMode(mode === "listen" ? "listen" : "play");
      showToast(mode === "listen" ? "已切换到听讲解演示状态。" : "已切换到播放演示状态。", "info");
    }
  }, [searchParams, showToast]);

  const categories = useMemo(() => {
    const categorySet = new Set<string>([allCategoryLabel]);
    courseItems.forEach((item) => categorySet.add(item.category));
    return [...categorySet];
  }, [courseItems]);

  const visibleCourses =
    activeCategory === allCategoryLabel
      ? courseItems
      : courseItems.filter((course) => course.category === activeCategory);

  const activeCourse = courseItems.find((course) => course.id === activeCourseId) ?? courseItems[0];

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="家医小课堂" subtitle="每天看一个小课，积少成多" />

        {/* Learning Progress */}
        <div className="flex items-center justify-between rounded-[22px] bg-surface-tint px-4 py-3">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-navy/55">已学习</p>
              <p className="mt-0.5 text-lg font-semibold text-navy">
                {state.viewedCourseIds.length}/{courseItems.length}
              </p>
            </div>
            <div className="h-8 w-px bg-line/60" />
            <div>
              <p className="text-xs text-navy/55">获得积分</p>
              <p className="mt-0.5 text-lg font-semibold text-amber">
                +{courseItems.filter((c) => state.viewedCourseIds.includes(c.id)).reduce((s, c) => s + c.points, 0)}
              </p>
            </div>
          </div>
          <div className="h-9 w-9 rounded-full border-[3px] border-sage/30 flex items-center justify-center">
            <span className="text-[10px] font-bold text-sage">
              {courseItems.length > 0
                ? Math.round((state.viewedCourseIds.length / courseItems.length) * 100)
                : 0}%
            </span>
          </div>
        </div>

        {/* Category Filter */}
        <SectionCard>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`rounded-full px-4 py-2.5 text-sm font-semibold transition active:scale-95 ${
                  activeCategory === category
                    ? "bg-navy text-white shadow-soft"
                    : "border border-line/70 bg-surface-card text-navy"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </SectionCard>

        {activeCourseId && playMode && activeCourse ? (
          <AudioPlayerCard
            course={activeCourse}
            mode={playMode}
            watched={state.viewedCourseIds.includes(activeCourseId)}
            onClaim={() => {
              const changed = completeCourse(activeCourse.id, activeCourse.points);
              showToast(
                changed ? "看课完成，积分已增加。" : "这门课的积分已经领过了。",
                changed ? "success" : "warning",
              );
              // Best-effort: record view in Supabase
              if (changed && isSupabaseMode) {
                void fetch("/api/courses/view", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ courseId: activeCourse.id, points: activeCourse.points }),
                }).catch(() => {});
              }
            }}
          />
        ) : null}

        <div className="space-y-4">
          {visibleCourses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              watched={state.viewedCourseIds.includes(course.id)}
              isActive={activeCourseId === course.id}
              onPlay={() => {
                setActiveCourseId(course.id);
                setPlayMode("play");
                showToast("已进入模拟播放状态。", "info");
              }}
              onListen={() => {
                setActiveCourseId(course.id);
                setPlayMode("listen");
                showToast("已进入模拟听讲解状态。", "info");
              }}
              onClaim={() => {
                const changed = completeCourse(course.id, course.points);
                showToast(
                  changed ? "看课完成，积分已增加。" : "这门课的积分已经领过了。",
                  changed ? "success" : "warning",
                );
                if (changed && isSupabaseMode) {
                  void fetch("/api/courses/view", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ courseId: course.id, points: course.points }),
                  }).catch(() => {});
                }
              }}
              canClaim={state.viewedCourseIds.includes(course.id)}
            />
          ))}
        </div>
      </div>
    </PhoneShell>
  );
}

export default function CoursesPage() {
  return (
    <Suspense
      fallback={
        <PhoneShell>
          <div className="space-y-5 px-4 pb-8">
            <BackHeader title="家医小课堂" />
          </div>
        </PhoneShell>
      }
    >
      <CoursesPageContent />
    </Suspense>
  );
}

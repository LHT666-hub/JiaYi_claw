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
import { ManagedCourseItem } from "@/lib/types";
import { useClawState } from "@/lib/useClawState";

const allCategoryLabel = "全部";

function CoursesPageContent() {
  const searchParams = useSearchParams();
  const handledInitial = useRef(false);
  const [activeCategory, setActiveCategory] = useState(allCategoryLabel);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState<"play" | "listen" | null>(null);
  const [courseItems, setCourseItems] = useState<ManagedCourseItem[]>([]);
  const { state, completeCourse } = useClawState();
  const { showToast } = useToast();

  useEffect(() => {
    setCourseItems(readMergedCourses());

    function syncCourses() {
      setCourseItems(readMergedCourses());
    }

    window.addEventListener(STORAGE_CHANGE_EVENT, syncCourses);
    window.addEventListener("storage", syncCourses);

    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, syncCourses);
      window.removeEventListener("storage", syncCourses);
    };
  }, []);

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
        <BackHeader title="家医小课堂" subtitle="优先展示管理员在本地维护的小课堂内容。" />

        <SectionCard>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeCategory === category
                    ? "bg-navy text-white"
                    : "border border-line bg-cream text-navy"
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

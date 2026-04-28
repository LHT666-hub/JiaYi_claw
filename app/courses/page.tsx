"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AudioPlayerCard } from "@/components/AudioPlayerCard";
import { BackHeader } from "@/components/BackHeader";
import { CourseCard } from "@/components/CourseCard";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import { courses } from "@/data/courses";
import { useClawState } from "@/lib/useClawState";

const categories = [
  "全部",
  "高血压",
  "糖尿病",
  "体检报告",
  "配药用药",
  "防保健品诈骗",
  "中医调养",
  "家庭医生服务",
];

function CoursesPageContent() {
  const searchParams = useSearchParams();
  const handledInitial = useRef(false);
  const [activeCategory, setActiveCategory] = useState("全部");
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState<"play" | "listen" | null>(null);
  const { state, completeCourse } = useClawState();
  const { showToast } = useToast();

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
      showToast(mode === "listen" ? "已切到听讲解演示状态" : "已切到播放演示状态", "info");
    }
  }, [searchParams, showToast]);

  const visibleCourses =
    activeCategory === "全部"
      ? courses
      : courses.filter((course) => course.category === activeCategory);

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="家医小课堂" />

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

        {activeCourseId && playMode ? (
          <AudioPlayerCard
            course={courses.find((course) => course.id === activeCourseId) ?? courses[0]}
            mode={playMode}
            watched={state.viewedCourseIds.includes(activeCourseId)}
            onClaim={() => {
              const course = courses.find((item) => item.id === activeCourseId);

              if (!course) {
                return;
              }

              const changed = completeCourse(course.id, course.points);
              showToast(
                changed ? "看课完成，积分已增加" : "这门课的积分已经领过了",
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
                showToast("已进入模拟播放状态", "info");
              }}
              onListen={() => {
                setActiveCourseId(course.id);
                setPlayMode("listen");
                showToast("已进入模拟听讲解状态", "info");
              }}
              onClaim={() => {
                const changed = completeCourse(course.id, course.points);
                showToast(
                  changed ? "看课完成，积分已增加" : "这门课的积分已经领过了",
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

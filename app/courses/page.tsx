"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AudioPlayerCard } from "@/components/AudioPlayerCard";
import { BackHeader } from "@/components/BackHeader";
import { CourseCard } from "@/components/CourseCard";
import { EmptyState } from "@/components/EmptyState";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import { STORAGE_CHANGE_EVENT, readMergedCourses } from "@/lib/storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fetchCurrentProfile } from "@/lib/supabase/mvp";
import { ManagedCourseItem, ProfileRow } from "@/lib/types";
import { useClawState } from "@/lib/useClawState";

const allCategoryLabel = "全部";
type AuthMode = "loading" | "real" | "local";

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

type CourseProgressPayload = {
  ok?: boolean;
  viewedCourseIds?: string[];
  totalPoints?: number;
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
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const handledInitial = useRef(false);
  const [activeCategory, setActiveCategory] = useState(allCategoryLabel);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState<"play" | "listen" | null>(null);
  const [courseItems, setCourseItems] = useState<ManagedCourseItem[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isSupabaseMode, setIsSupabaseMode] = useState(false);
  const [remoteViewedCourseIds, setRemoteViewedCourseIds] = useState<string[]>([]);
  const [remotePoints, setRemotePoints] = useState(0);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const { state, completeCourse } = useClawState();
  const { showToast } = useToast();

  const viewedCourseIds = isSupabaseMode ? remoteViewedCourseIds : state.viewedCourseIds;
  const earnedPoints = isSupabaseMode
    ? remotePoints
    : courseItems.filter((c) => state.viewedCourseIds.includes(c.id)).reduce((sum, c) => sum + c.points, 0);

  useEffect(() => {
    let active = true;

    async function bootstrapCourses() {
      if (!isSupabaseConfigured() || !supabase) {
        setAuthMode("local");
        setCourseItems(readMergedCourses());
        return;
      }

      try {
        const currentProfile = await fetchCurrentProfile(supabase);

        if (!active) {
          return;
        }

        if (!currentProfile) {
          setAuthMode("local");
          setCourseItems(readMergedCourses());
          return;
        }

        setProfile(currentProfile);
        setAuthMode("real");

        const [coursesResponse, progressResponse] = await Promise.all([
          fetch("/api/courses", { method: "GET", cache: "no-store" }),
          fetch("/api/courses/progress", { method: "GET", cache: "no-store" }),
        ]);
        const coursesPayload = (await coursesResponse.json()) as {
          ok?: boolean;
          courses?: CourseApiRow[];
        };
        const progressPayload = (await progressResponse.json()) as CourseProgressPayload;

        if (
          !active ||
          !coursesResponse.ok ||
          !coursesPayload.ok ||
          !coursesPayload.courses?.length ||
          !progressResponse.ok ||
          !progressPayload.ok
        ) {
          return;
        }

        setCourseItems(coursesPayload.courses.map(mapCourseRowToManaged));
        setRemoteViewedCourseIds(progressPayload.viewedCourseIds ?? []);
        setRemotePoints(progressPayload.totalPoints ?? 0);
        setIsSupabaseMode(true);
        setRemoteError(null);
      } catch {
        if (!active) {
          return;
        }
        setIsSupabaseMode(false);
        setCourseItems([]);
        setRemoteViewedCourseIds([]);
        setRemotePoints(0);
        setRemoteError("当前账号的小课堂内容和学习积分暂时还没同步成功，请稍后刷新再试。");
      }
    }

    void bootstrapCourses();

    function syncCourses() {
      if (!isSupabaseMode) {
        setCourseItems(readMergedCourses());
      }
    }

    if (authMode !== "real") {
      window.addEventListener(STORAGE_CHANGE_EVENT, syncCourses);
      window.addEventListener("storage", syncCourses);
    }

    return () => {
      active = false;
      window.removeEventListener(STORAGE_CHANGE_EVENT, syncCourses);
      window.removeEventListener("storage", syncCourses);
    };
  }, [authMode, isSupabaseMode, supabase]);

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
      showToast(mode === "listen" ? "已切换到听讲解。" : "已切换到播放。", "info");
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
        <BackHeader title="家医小课堂" />

        {authMode === "real" && remoteError ? (
          <SectionCard>
            <div className="rounded-[22px] border border-amber/25 bg-[#FFF6EA] px-4 py-4">
              <p className="text-sm font-semibold text-navy">数据同步稍有延迟</p>
              <p className="mt-1 text-sm leading-6 text-navy/66">{remoteError}</p>
              {profile?.display_name ? (
                <p className="mt-2 text-xs text-navy/50">当前账号：{profile.display_name}</p>
              ) : null}
            </div>
          </SectionCard>
        ) : null}

        {/* Learning Progress */}
        <div className="flex items-center justify-between rounded-[22px] bg-surface-tint px-4 py-3">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-navy/55">已学习</p>
              <p className="mt-0.5 text-lg font-semibold text-navy">
                {viewedCourseIds.length}/{courseItems.length}
              </p>
            </div>
            <div className="h-8 w-px bg-line/60" />
            <div>
              <p className="text-xs text-navy/55">获得积分</p>
              <p className="mt-0.5 text-lg font-semibold text-amber">
                +{earnedPoints}
              </p>
            </div>
          </div>
          <div className="h-9 w-9 rounded-full border-[3px] border-sage/30 flex items-center justify-center">
            <span className="text-[10px] font-bold text-sage">
              {courseItems.length > 0
                ? Math.round((viewedCourseIds.length / courseItems.length) * 100)
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

        {!courseItems.length ? (
          <SectionCard>
            <EmptyState
              title={authMode === "real" ? "课程暂未同步" : "暂时还没有课程"}
              description={
                authMode === "real"
                  ? "等当前账号的小课堂内容同步成功后，这里会显示可学习的课程。"
                  : "课程内容会显示在这里。"
              }
            />
          </SectionCard>
        ) : null}

        {activeCourseId && playMode && activeCourse ? (
          <AudioPlayerCard
            course={activeCourse}
            mode={playMode}
            watched={viewedCourseIds.includes(activeCourseId)}
            remoteMode={isSupabaseMode}
            onClaim={() => {
              if (isSupabaseMode) {
                if (viewedCourseIds.includes(activeCourse.id)) {
                  showToast("这门课的积分已经领过了。", "warning");
                  return;
                }

                void fetch("/api/courses/view", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ courseId: activeCourse.id, points: activeCourse.points }),
                })
                  .then(async (response) => {
                    const payload = (await response.json().catch(() => ({}))) as {
                      ok?: boolean;
                      duplicate?: boolean;
                    };

                    if (response.ok && payload.ok) {
                      setRemoteViewedCourseIds((current) =>
                        current.includes(activeCourse.id) ? current : [...current, activeCourse.id],
                      );
                      setRemotePoints((current) => current + activeCourse.points);
                      showToast("看课完成，积分已同步到当前账号。", "success");
                      return;
                    }

                    showToast(
                      payload.duplicate ? "这门课今天已经领过积分了。" : "积分同步失败，请稍后再试。",
                      "warning",
                    );
                  })
                  .catch(() => {
                    showToast("积分同步失败，请稍后再试。", "warning");
                  });

                return;
              }

              const changed = completeCourse(activeCourse.id, activeCourse.points);
              showToast(
                changed ? "看课完成，积分已增加。" : "这门课的积分已经领过了。",
                changed ? "success" : "warning",
              );
            }}
          />
        ) : null}

        {courseItems.length ? (
          <div className="space-y-4">
            {visibleCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                watched={viewedCourseIds.includes(course.id)}
                isActive={activeCourseId === course.id}
                onPlay={() => {
                  setActiveCourseId(course.id);
                  setPlayMode("play");
                  showToast("已进入播放。", "info");
                }}
                onListen={() => {
                  setActiveCourseId(course.id);
                  setPlayMode("listen");
                  showToast("已进入听讲解。", "info");
                }}
                onClaim={() => {
                  if (isSupabaseMode) {
                    if (viewedCourseIds.includes(course.id)) {
                      showToast("这门课的积分已经领过了。", "warning");
                      return;
                    }

                    void fetch("/api/courses/view", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ courseId: course.id, points: course.points }),
                    })
                      .then(async (response) => {
                        const payload = (await response.json().catch(() => ({}))) as {
                          ok?: boolean;
                          duplicate?: boolean;
                        };

                        if (response.ok && payload.ok) {
                          setRemoteViewedCourseIds((current) =>
                            current.includes(course.id) ? current : [...current, course.id],
                          );
                          setRemotePoints((current) => current + course.points);
                          setRemoteError(null);
                          showToast("看课完成，积分已同步到当前账号。", "success");
                          return;
                        }

                        setRemoteError("课程积分暂时没有同步成功，请稍后重试。");
                        showToast(
                          payload.duplicate ? "这门课今天已经领过积分了。" : "积分同步失败，请稍后再试。",
                          "warning",
                        );
                      })
                      .catch(() => {
                        setRemoteError("课程积分暂时没有同步成功，请稍后重试。");
                        showToast("积分同步失败，请稍后再试。", "warning");
                      });
                    return;
                  }

                  const changed = completeCourse(course.id, course.points);
                  showToast(
                    changed ? "看课完成，积分已增加。" : "这门课的积分已经领过了。",
                    changed ? "success" : "warning",
                  );
                }}
                canClaim={viewedCourseIds.includes(course.id)}
              />
            ))}
          </div>
        ) : null}
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

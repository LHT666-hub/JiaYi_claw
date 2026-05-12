import { TypedSupabaseClient } from "@/lib/supabase/types";

export type CourseRow = {
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

export type CourseViewRow = {
  id: string;
  resident_id: string;
  course_id: string;
  viewed_at: string;
  points_awarded: number;
};

export async function getPublishedCourses(supabase: TypedSupabaseClient) {
  try {
    const { data, error } = await supabase
      .from("courses")
      .select("id, title, category, audience, summary, duration, points, video_url, status, created_at, updated_at")
      .eq("status", "published")
      .order("created_at", { ascending: true });

    if (error || !data) return [];
    return data as CourseRow[];
  } catch {
    return [];
  }
}

export async function getAllCourses(supabase: TypedSupabaseClient) {
  try {
    const { data, error } = await supabase
      .from("courses")
      .select("id, title, category, audience, summary, duration, points, video_url, status, created_at, updated_at")
      .order("created_at", { ascending: true });

    if (error || !data) return [];
    return data as CourseRow[];
  } catch {
    return [];
  }
}

export async function upsertCourse(
  course: Partial<CourseRow> & { title: string; category: string },
  supabase: TypedSupabaseClient,
) {
  try {
    if (course.id) {
      const { data, error } = await supabase
        .from("courses")
        .update({
          title: course.title,
          category: course.category,
          audience: course.audience ?? null,
          summary: course.summary ?? null,
          duration: course.duration ?? null,
          points: course.points ?? 0,
          video_url: course.video_url ?? null,
          status: course.status ?? "published",
        })
        .eq("id", course.id)
        .select()
        .maybeSingle();
      if (error || !data) return { ok: false, message: error?.message ?? "更新失败" };
      return { ok: true, course: data as CourseRow };
    }

    const { data, error } = await supabase
      .from("courses")
      .insert({
        title: course.title,
        category: course.category,
        audience: course.audience ?? null,
        summary: course.summary ?? null,
        duration: course.duration ?? null,
        points: course.points ?? 0,
        video_url: course.video_url ?? null,
        status: course.status ?? "published",
      })
      .select()
      .maybeSingle();

    if (error || !data) return { ok: false, message: error?.message ?? "创建失败" };
    return { ok: true, course: data as CourseRow };
  } catch {
    return { ok: false, message: "操作失败" };
  }
}

export async function getCourseViewsForResident(
  residentId: string,
  supabase: TypedSupabaseClient,
) {
  try {
    const { data, error } = await supabase
      .from("course_views")
      .select("id, resident_id, course_id, viewed_at, points_awarded")
      .eq("resident_id", residentId)
      .order("viewed_at", { ascending: false });

    if (error || !data) return [];
    return data as CourseViewRow[];
  } catch {
    return [];
  }
}

export async function recordCourseView(
  residentId: string,
  courseId: string,
  points: number,
  supabase: TypedSupabaseClient,
) {
  try {
    // Insert; the unique index on (resident_id, course_id, date) prevents daily duplicates
    const { data, error } = await supabase
      .from("course_views")
      .insert({
        resident_id: residentId,
        course_id: courseId,
        points_awarded: points,
      })
      .select()
      .maybeSingle();

    if (error) {
      // Unique violation = already viewed today
      if (error.code === "23505") {
        return { ok: false, duplicate: true, message: "今天已经看过这门课了" };
      }
      return { ok: false, duplicate: false, message: error.message };
    }

    return { ok: true, duplicate: false, view: data as CourseViewRow };
  } catch {
    return { ok: false, duplicate: false, message: "记录失败" };
  }
}

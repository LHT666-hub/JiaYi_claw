import { NextRequest, NextResponse } from "next/server";
import { getAllCourses, getPublishedCourses, upsertCourse } from "@/lib/db/courses";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function GET() {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json(
      { message: "当前未登录或 Supabase 未配置" },
      { status: 401 },
    );
  }

  const courses =
    profile.role === "admin"
      ? await getAllCourses(supabase)
      : await getPublishedCourses(supabase);

  return NextResponse.json({ ok: true, courses });
}

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置" }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ message: "仅管理员可新增课程" }, { status: 403 });
  }

  const body = (await request.json()) as {
    title?: string;
    category?: string;
    audience?: string;
    summary?: string;
    duration?: string;
    points?: number;
    videoUrl?: string;
    status?: string;
  };

  if (!body.title || !body.category) {
    return NextResponse.json({ message: "标题和分类为必填" }, { status: 400 });
  }

  const result = await upsertCourse(
    {
      title: body.title,
      category: body.category,
      audience: body.audience ?? null,
      summary: body.summary ?? null,
      duration: body.duration ?? null,
      points: body.points ?? 0,
      video_url: body.videoUrl ?? null,
      status: body.status ?? "published",
    },
    supabase,
  );

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, course: result.course });
}

export async function PATCH(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置" }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ message: "仅管理员可编辑课程" }, { status: 403 });
  }

  const body = (await request.json()) as {
    id?: string;
    title?: string;
    category?: string;
    audience?: string;
    summary?: string;
    duration?: string;
    points?: number;
    videoUrl?: string;
    status?: string;
  };

  if (!body.id) {
    return NextResponse.json({ message: "缺少课程 ID" }, { status: 400 });
  }

  const result = await upsertCourse(
    {
      id: body.id,
      title: body.title ?? "",
      category: body.category ?? "",
      audience: body.audience ?? null,
      summary: body.summary ?? null,
      duration: body.duration ?? null,
      points: body.points ?? 0,
      video_url: body.videoUrl ?? null,
      status: body.status ?? "published",
    },
    supabase,
  );

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, course: result.course });
}

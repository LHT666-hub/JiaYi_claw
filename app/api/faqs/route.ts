import { NextRequest, NextResponse } from "next/server";
import { listFaqsForAdmin, saveFaqForAdmin, setFaqActiveStatus } from "@/lib/db/faqs";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function GET() {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置" }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ message: "当前身份暂无管理员权限" }, { status: 403 });
  }

  try {
    const items = await listFaqsForAdmin(supabase);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "FAQ 读取失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置" }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ message: "当前身份暂无管理员权限" }, { status: 403 });
  }

  const body = (await request.json()) as {
    id?: string;
    question?: string;
    keywords?: string[];
    category?: string;
    answer?: string;
    nextStep?: string;
    suggestDoctor?: boolean;
    riskLevel?: "low" | "medium" | "high" | "emergency";
    isActive?: boolean;
  };

  if (!body.question || !body.category || !body.answer || !body.riskLevel) {
    return NextResponse.json({ message: "FAQ 参数不完整" }, { status: 400 });
  }

  try {
    const item = await saveFaqForAdmin({
      id: body.id,
      question: body.question.trim(),
      keywords: Array.isArray(body.keywords) ? body.keywords.map((item) => String(item).trim()).filter(Boolean) : [],
      category: body.category.trim(),
      answer: body.answer.trim(),
      nextStep: body.nextStep?.trim() ?? "",
      suggestDoctor: Boolean(body.suggestDoctor),
      riskLevel: body.riskLevel,
      isActive: body.isActive ?? true,
      supabase,
    });

    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "FAQ 保存失败" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置" }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ message: "当前身份暂无管理员权限" }, { status: 403 });
  }

  const body = (await request.json()) as {
    id?: string;
    isActive?: boolean;
  };

  if (!body.id || typeof body.isActive !== "boolean") {
    return NextResponse.json({ message: "FAQ 状态参数不完整" }, { status: 400 });
  }

  try {
    const item = await setFaqActiveStatus(body.id, body.isActive, supabase);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "FAQ 状态更新失败" },
      { status: 500 },
    );
  }
}

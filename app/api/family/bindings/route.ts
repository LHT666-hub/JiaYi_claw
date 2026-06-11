import { NextRequest, NextResponse } from "next/server";
import {
  createFamilyBindingForAdmin,
  listFamilyBindingsForRole,
  updateFamilyBindingForAdmin,
} from "@/lib/db/familyBindings";
import { getServerAuthContext } from "@/lib/supabase/server-auth";
import { FamilyBindingStatus } from "@/lib/types";

const allowedStatuses = new Set<FamilyBindingStatus>(["pending", "active", "disabled"]);

export async function GET() {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ ok: true, bindings: [] });
  }

  try {
    const bindings = await listFamilyBindingsForRole(profile.id, profile.role, supabase);
    return NextResponse.json({ ok: true, bindings });
  } catch {
    return NextResponse.json({ ok: true, bindings: [] });
  }
}

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录。" }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ message: "当前身份暂无管理员权限。" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    residentId?: string;
    familyId?: string;
    relationship?: string;
    note?: string | null;
    isPrimary?: boolean;
  };

  if (!body.residentId || !body.familyId || !body.relationship?.trim()) {
    return NextResponse.json({ message: "家属绑定参数不完整。" }, { status: 400 });
  }

  try {
    const binding = await createFamilyBindingForAdmin({
      residentId: body.residentId,
      familyId: body.familyId,
      relationship: body.relationship.trim(),
      note: body.note ?? null,
      isPrimary: Boolean(body.isPrimary),
      supabase,
    });
    return NextResponse.json({ ok: true, binding });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "家属绑定保存失败。" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录。" }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ message: "当前身份暂无管理员权限。" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    relationship?: string;
    note?: string | null;
    isPrimary?: boolean;
    status?: FamilyBindingStatus;
  };

  if (!body.id) {
    return NextResponse.json({ message: "缺少绑定关系 ID。" }, { status: 400 });
  }

  if (body.status && !allowedStatuses.has(body.status)) {
    return NextResponse.json({ message: "绑定状态不合法。" }, { status: 400 });
  }

  try {
    const binding = await updateFamilyBindingForAdmin({
      id: body.id,
      relationship: body.relationship?.trim(),
      note: body.note ?? undefined,
      isPrimary: body.isPrimary,
      status: body.status,
      supabase,
    });
    return NextResponse.json({ ok: true, binding });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "家属绑定更新失败。" },
      { status: 500 },
    );
  }
}

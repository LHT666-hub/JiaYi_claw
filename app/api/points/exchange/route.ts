import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/db/audit";
import { exchangePoints } from "@/lib/db/points";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置。" }, { status: 401 });
  }

  if (profile.role !== "resident" && profile.role !== "admin") {
    return NextResponse.json({ message: "当前角色暂不支持积分兑换。" }, { status: 403 });
  }

  const body = (await request.json()) as {
    itemName?: string;
    pointsCost?: number;
    residentId?: string;
  };

  const itemName = typeof body.itemName === "string" ? body.itemName.trim() : "";
  const pointsCost = Number(body.pointsCost ?? 0);
  const residentId =
    profile.role === "admin" && typeof body.residentId === "string" && body.residentId
      ? body.residentId
      : profile.id;

  if (!itemName || !Number.isFinite(pointsCost) || pointsCost <= 0) {
    return NextResponse.json({ message: "兑换参数不完整。" }, { status: 400 });
  }

  const result = await exchangePoints({
    residentId,
    itemName,
    pointsCost,
    createdBy: profile.id,
    supabase,
  });

  if (!result.ok) {
    return NextResponse.json(
      { message: result.message ?? "兑换失败。", insufficient: result.insufficient ?? false },
      { status: result.insufficient ? 400 : 500 },
    );
  }

  await writeAuditLog({
    actorId: profile.id,
    action: "points.exchange",
    targetTable: "exchanges",
    targetId: result.exchangeId ?? null,
    detail: {
      residentId,
      itemName,
      pointsCost,
      balanceAfter: result.balanceAfter,
    },
    supabase,
  });

  return NextResponse.json({
    ok: true,
    points: result.balanceAfter,
    exchangeId: result.exchangeId,
  });
}

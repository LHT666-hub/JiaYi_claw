import { TypedSupabaseClient } from "@/lib/supabase/types";
import { PointsLedgerRow } from "@/lib/types";

type AddPointsLedgerInput = {
  residentId: string;
  change: number;
  reason: string;
  sourceType: "task" | "course" | "group" | "exchange" | "manual" | "system";
  sourceId?: string | null;
  createdBy?: string | null;
  supabase: TypedSupabaseClient;
};

type ExchangePointsInput = {
  residentId: string;
  itemName: string;
  pointsCost: number;
  createdBy?: string | null;
  supabase: TypedSupabaseClient;
};

export async function getResidentPoints(
  residentId: string,
  supabase: TypedSupabaseClient,
) {
  const { data, error } = await supabase
    .from("points_ledger")
    .select(
      "id, resident_id, change, reason, source_type, source_id, balance_after, created_at, created_by",
    )
    .eq("resident_id", residentId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to read points ledger");
  }

  const ledger = data as PointsLedgerRow[];
  const points = ledger.reduce((total, item) => total + Number(item.change || 0), 0);

  return { points, ledger };
}

export async function getResidentPointsSummary(
  residentId: string,
  supabase: TypedSupabaseClient,
) {
  const { points, ledger } = await getResidentPoints(residentId, supabase);

  return {
    totalPoints: points,
    recentLedger: [...ledger].slice(-10).reverse(),
  };
}

export async function addPointsLedger({
  residentId,
  change,
  reason,
  sourceType,
  sourceId = null,
  createdBy = null,
  supabase,
}: AddPointsLedgerInput) {
  try {
    const current = await getResidentPoints(residentId, supabase);
    const balanceAfter = current.points + change;

    const { data, error } = await supabase
      .from("points_ledger")
      .insert({
        resident_id: residentId,
        change,
        reason,
        source_type: sourceType,
        source_id: sourceId,
        balance_after: balanceAfter,
        created_by: createdBy,
      })
      .select(
        "id, resident_id, change, reason, source_type, source_id, balance_after, created_at, created_by",
      )
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        balanceAfter: current.points,
        message: error?.message ?? "积分流水写入失败",
      };
    }

    return {
      ok: true,
      balanceAfter,
      entry: data as PointsLedgerRow,
    };
  } catch {
    return {
      ok: false,
      balanceAfter: 0,
      message: "积分流水写入失败",
    };
  }
}

export async function exchangePoints({
  residentId,
  itemName,
  pointsCost,
  createdBy = null,
  supabase,
}: ExchangePointsInput) {
  try {
    const current = await getResidentPoints(residentId, supabase);

    if (current.points < pointsCost) {
      return {
        ok: false,
        insufficient: true,
        balanceAfter: current.points,
        message: "当前积分不足，暂时无法兑换这个项目",
      };
    }

    const { data: exchangeRow, error: exchangeError } = await supabase
      .from("exchanges")
      .insert({
        resident_id: residentId,
        item_name: itemName,
        points_cost: pointsCost,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .select("id, resident_id, item_name, points_cost, status, created_at, completed_at")
      .maybeSingle();

    if (exchangeError || !exchangeRow) {
      return {
        ok: false,
        insufficient: false,
        balanceAfter: current.points,
        message: exchangeError?.message ?? "兑换记录写入失败",
      };
    }

    const ledgerResult = await addPointsLedger({
      residentId,
      change: -pointsCost,
      reason: `兑换${itemName}`,
      sourceType: "exchange",
      sourceId: String(exchangeRow.id),
      createdBy,
      supabase,
    });

    if (!ledgerResult.ok) {
      return {
        ok: false,
        insufficient: false,
        balanceAfter: current.points,
        message: ledgerResult.message ?? "兑换积分扣减失败",
      };
    }

    return {
      ok: true,
      exchangeId: String(exchangeRow.id),
      balanceAfter: ledgerResult.balanceAfter,
    };
  } catch {
    return {
      ok: false,
      insufficient: false,
      balanceAfter: 0,
      message: "兑换失败",
    };
  }
}

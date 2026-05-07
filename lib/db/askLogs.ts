import { TypedSupabaseClient } from "@/lib/supabase/types";
import { AskSource, RiskLevel } from "@/lib/types";

type CreateAskLogInput = {
  userId?: string | null;
  question: string;
  answer?: string | null;
  source: AskSource;
  category?: string | null;
  riskLevel?: RiskLevel | null;
  suggestDoctor?: boolean;
  reason?: string | null;
  supabase: TypedSupabaseClient;
};

function getShanghaiTodayRange() {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const start = new Date(local);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export async function createAskLog({
  userId = null,
  question,
  answer = null,
  source,
  category = null,
  riskLevel = null,
  suggestDoctor = false,
  reason = null,
  supabase,
}: CreateAskLogInput) {
  const { data, error } = await supabase
    .from("ask_logs")
    .insert({
      user_id: userId,
      question,
      answer,
      source,
      category,
      risk_level: riskLevel,
      suggest_doctor: suggestDoctor,
      reason,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create ask log");
  }

  return data;
}

export async function getAskDashboardMetrics(supabase: TypedSupabaseClient) {
  const { startIso, endIso } = getShanghaiTodayRange();

  const { data, error } = await supabase
    .from("ask_logs")
    .select("source")
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load ask dashboard metrics");
  }

  const sourceList = data.map((item) => String(item.source ?? ""));

  return {
    askCountToday: sourceList.length,
    faqHitCount: sourceList.filter((item) => item === "faq").length,
    safetyBlockCount: sourceList.filter((item) => item === "safety").length,
    kimiCount: sourceList.filter((item) => item === "kimi" || item === "knowledge_kimi").length,
    fallbackCount: sourceList.filter((item) => item === "fallback").length,
  };
}

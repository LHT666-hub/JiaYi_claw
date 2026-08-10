import { faqs as localFaqs } from "@/data/faqs";
import { matchFaqFromItems } from "@/lib/faq";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import { TypedSupabaseClient } from "@/lib/supabase/types";
import { FaqItem, ManagedFaqItem } from "@/lib/types";

const FAQ_CACHE_TTL_MS = 5 * 60 * 1000;
let faqCache: { expiresAt: number; items: FaqItem[] } | null = null;

function nowIso() {
  return new Date().toISOString();
}

export function mapFaqRows(rows: Array<Record<string, unknown>>): FaqItem[] {
  return rows.map((row) => ({
    id: String(row.id),
    question: String(row.question),
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    category: String(row.category),
    answer: String(row.answer),
    nextStep: String(row.next_step ?? ""),
    suggestDoctor: Boolean(row.suggest_doctor),
    riskLevel: String(row.risk_level ?? "low") as FaqItem["riskLevel"],
  }));
}

function mapManagedFaqRows(
  rows: Array<Record<string, unknown>>,
): ManagedFaqItem[] {
  return rows.map((row) => ({
    id: String(row.id),
    question: String(row.question),
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    category: String(row.category),
    answer: String(row.answer),
    nextStep: String(row.next_step ?? ""),
    suggestDoctor: Boolean(row.suggest_doctor),
    riskLevel: String(row.risk_level ?? "low") as ManagedFaqItem["riskLevel"],
    isActive: Boolean(row.is_active ?? true),
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  }));
}

export function resetFaqCache() {
  faqCache = null;
}

export async function getFaqs(supabaseClient?: TypedSupabaseClient | null) {
  const allowDemoFallback = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  try {
    const now = Date.now();

    if (faqCache && faqCache.expiresAt > now) {
      return faqCache.items;
    }

    const supabase = supabaseClient ?? createSupabasePublicServerClient();

    if (!supabase) {
      return allowDemoFallback ? localFaqs : [];
    }

    const { data, error } = await supabase
      .from("faqs")
      .select(
        "id, question, keywords, category, answer, next_step, suggest_doctor, risk_level, is_active, created_at, updated_at",
      )
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: true });

    if (error || !data?.length) {
      return allowDemoFallback ? localFaqs : [];
    }

    const items = mapFaqRows(data as Array<Record<string, unknown>>);
    faqCache = {
      items,
      expiresAt: now + FAQ_CACHE_TTL_MS,
    };

    return items;
  } catch {
    return allowDemoFallback ? localFaqs : [];
  }
}

export async function listFaqsForAdmin(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("faqs")
    .select(
      "id, question, keywords, category, answer, next_step, suggest_doctor, risk_level, is_active, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load FAQs");
  }

  return mapManagedFaqRows(data as Array<Record<string, unknown>>);
}

type SaveFaqInput = {
  id?: string;
  question: string;
  keywords: string[];
  category: string;
  answer: string;
  nextStep?: string;
  suggestDoctor?: boolean;
  riskLevel: ManagedFaqItem["riskLevel"];
  isActive?: boolean;
  supabase: TypedSupabaseClient;
};

export async function saveFaqForAdmin({
  id,
  question,
  keywords,
  category,
  answer,
  nextStep = "",
  suggestDoctor = false,
  riskLevel,
  isActive = true,
  supabase,
}: SaveFaqInput) {
  const payload = {
    question,
    keywords,
    category,
    answer,
    next_step: nextStep || null,
    suggest_doctor: suggestDoctor,
    risk_level: riskLevel,
    is_active: isActive,
  };

  const query = id
    ? supabase.from("faqs").update(payload).eq("id", id)
    : supabase.from("faqs").insert(payload);

  const { data, error } = await query
    .select(
      "id, question, keywords, category, answer, next_step, suggest_doctor, risk_level, is_active, created_at, updated_at",
    )
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save FAQ");
  }

  resetFaqCache();
  return mapManagedFaqRows([data as Record<string, unknown>])[0];
}

export async function setFaqActiveStatus(
  id: string,
  isActive: boolean,
  supabase: TypedSupabaseClient,
) {
  const { data, error } = await supabase
    .from("faqs")
    .update({ is_active: isActive })
    .eq("id", id)
    .select(
      "id, question, keywords, category, answer, next_step, suggest_doctor, risk_level, is_active, created_at, updated_at",
    )
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update FAQ status");
  }

  resetFaqCache();
  return mapManagedFaqRows([data as Record<string, unknown>])[0];
}

export async function searchFaqsFromDb(question: string) {
  try {
    const faqItems = await getFaqs();
    return matchFaqFromItems(question, faqItems)?.item ?? null;
  } catch {
    return null;
  }
}

import { faqs as localFaqs } from "@/data/faqs";
import { matchFaqFromItems } from "@/lib/faq";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import { FaqItem } from "@/lib/types";

const FAQ_CACHE_TTL_MS = 5 * 60 * 1000;
let faqCache: { expiresAt: number; items: FaqItem[] } | null = null;

function mapFaqRows(rows: Array<Record<string, unknown>>): FaqItem[] {
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

export async function getFaqs() {
  try {
    const now = Date.now();

    if (faqCache && faqCache.expiresAt > now) {
      return faqCache.items;
    }

    const supabase = createSupabasePublicServerClient();

    if (!supabase) {
      return localFaqs;
    }

    const { data, error } = await supabase
      .from("faqs")
      .select("id, question, keywords, category, answer, next_step, suggest_doctor, risk_level")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error || !data?.length) {
      return localFaqs;
    }

    const items = mapFaqRows(data as Array<Record<string, unknown>>);
    faqCache = {
      items,
      expiresAt: now + FAQ_CACHE_TTL_MS,
    };

    return items;
  } catch {
    return localFaqs;
  }
}

export async function searchFaqsFromDb(question: string) {
  try {
    const faqItems = await getFaqs();
    return matchFaqFromItems(question, faqItems)?.item ?? null;
  } catch {
    return null;
  }
}

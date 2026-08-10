import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { getLegalOperator, LEGAL_POLICY_VERSION } from "@/lib/legal";

export function LegalPage({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  const operator = getLegalOperator();
  return <PhoneShell><main className="px-4 pb-10 pt-6 text-navy"><header className="flex items-center gap-3"><Link href="/login" aria-label="返回登录" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface-card"><ArrowLeft className="h-5 w-5" /></Link><div><p className="text-xs font-semibold text-sage">版本 {LEGAL_POLICY_VERSION}</p><h1 className="mt-1 font-brand text-2xl font-semibold">{title}</h1></div></header><section className="ios-material mt-6 rounded-[30px] p-5"><p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-5 w-5 text-sage" />{operator.name}</p><p className="mt-3 text-sm leading-7 text-navy/62">{summary}</p><p className="mt-3 text-xs leading-5 text-navy/45">生效日期：{operator.effectiveDate}<br />隐私联系：{operator.contact}</p></section><article className="legal-document mt-5 space-y-6 rounded-[30px] border border-line bg-surface-card p-5 text-sm leading-7 text-navy/68">{children}</article></main></PhoneShell>;
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) { return <section><h2 className="text-base font-semibold text-navy">{title}</h2><div className="mt-2 space-y-2">{children}</div></section>; }

"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ChevronRight, MessageCircle, Mic, Send, Sparkles, X } from "lucide-react";
import { HoldToTalkButton } from "@/components/HoldToTalkButton";
import type { ServiceType } from "@jiayi/contracts";

export type ClawAppointmentDraft = {
  serviceType?: ServiceType;
  target?: string;
  department?: string;
  doctor?: string;
  note?: string;
  preferredDate?: string;
  preferredTime?: string;
  contactPhone?: string;
};

type Props = {
  onAppointmentDraft?: (draft: ClawAppointmentDraft) => void;
};

type AssistantAction = {
  id: string;
  label: string;
  description: string;
  href: string;
};

function readAppointmentDraft(href: string): ClawAppointmentDraft | null {
  if (!href.startsWith("/appointments")) return null;
  const params = new URL(href, "https://jiayi.local").searchParams;
  return {
    serviceType: (params.get("type") as ServiceType | null) ?? undefined,
    target: params.get("target") ?? undefined,
    department: params.get("department") ?? undefined,
    doctor: params.get("doctor") ?? undefined,
    note: params.get("note") ?? undefined,
  };
}

function readStructuredDraft(value: unknown): ClawAppointmentDraft | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const kindToType: Record<string, ServiceType> = {
    registration: "clinic_registration",
    family_doctor: "family_doctor_booking",
    referral: "referral_assistance",
    refill: "refill_request",
    followup: "followup_reminder",
  };
  const serviceType = typeof item.kind === "string" ? kindToType[item.kind] : undefined;
  if (!serviceType) return null;
  return {
    serviceType,
    target: typeof item.target === "string" ? item.target : undefined,
    department: typeof item.department === "string" ? item.department : undefined,
    doctor: typeof item.preferredDoctor === "string" ? item.preferredDoctor : undefined,
    note: typeof item.note === "string" ? item.note : undefined,
    preferredDate: typeof item.preferredDate === "string" ? item.preferredDate : undefined,
    preferredTime: typeof item.preferredTime === "string" ? item.preferredTime : undefined,
  };
}

export function GlobalClawAssistant({ onAppointmentDraft }: Props) {
  const [open, setOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("直接告诉我想办什么，我会先查证，再帮您把下一步准备好。");
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [loading, setLoading] = useState(false);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = question.trim();
    if (!text || loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/v1/assistant/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Claw 暂时无法处理");
      const nextActions = (payload.data.actions ?? []) as AssistantAction[];
      setAnswer(payload.data.reply?.answer ?? "已收到。请继续补充办理信息。");
      const draftAction = nextActions.find((action) => action.href.startsWith("/appointments"));
      const hrefDraft = draftAction ? readAppointmentDraft(draftAction.href) : null;
      const structuredDraft = readStructuredDraft(payload.data.draft);
      const spokenPhone = text.match(/1\d{10}/)?.[0];
      const draft = structuredDraft || hrefDraft
        ? {
            ...hrefDraft,
            ...(structuredDraft?.serviceType ? { serviceType: structuredDraft.serviceType } : {}),
            ...(structuredDraft?.target ? { target: structuredDraft.target } : {}),
            ...(structuredDraft?.department ? { department: structuredDraft.department } : {}),
            ...(structuredDraft?.doctor ? { doctor: structuredDraft.doctor } : {}),
            ...(structuredDraft?.note ? { note: structuredDraft.note } : {}),
            ...(structuredDraft?.preferredDate ? { preferredDate: structuredDraft.preferredDate } : {}),
            ...(structuredDraft?.preferredTime ? { preferredTime: structuredDraft.preferredTime } : {}),
            ...(spokenPhone ? { contactPhone: spokenPhone } : {}),
          }
        : null;
      if (draft && onAppointmentDraft) {
        onAppointmentDraft(draft);
        const missing = [
          !draft.target ? "本次主要诉求" : null,
          !draft.preferredDate ? "希望日期" : null,
          !draft.contactPhone ? "联系电话" : null,
        ].filter(Boolean);
        setAnswer(`${payload.data.reply?.answer ?? "已理解您的需求。"}\n\n我已把能确定的信息填入预约申请。${missing.length ? `还需要您补充：${missing.join("、")}。` : "信息已齐，请核对后确认提交。"}`);
        setActions(nextActions.filter((action) => !action.href.startsWith("/appointments")));
      } else {
        setActions(nextActions);
      }
      setQuestion("");
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : "网络连接失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="随时呼出 Claw"
        className="ios-pressable absolute bottom-[116px] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-navy text-white shadow-[0_16px_34px_rgba(16,42,67,0.3)]"
      >
        <Sparkles className="h-6 w-6" />
      </button>
      {open ? (
        <>
          <button type="button" aria-label="关闭 Claw" onClick={() => setOpen(false)} className="absolute inset-0 z-40 bg-navy/12 backdrop-blur-[2px]" />
          <section className="ios-material absolute inset-x-3 bottom-[18px] z-50 rounded-[30px] p-4 shadow-[0_26px_64px_rgba(16,42,67,0.24)]">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-white"><Sparkles className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><h2 className="font-brand text-lg font-semibold text-navy">Claw 在这里</h2><p className="mt-1 text-xs text-navy/45">查信息、填预约、整理下一步</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="关闭" className="ios-control flex h-10 w-10 items-center justify-center rounded-full text-navy"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 max-h-40 overflow-y-auto whitespace-pre-line rounded-[22px] bg-health-soft p-4 text-sm leading-6 text-navy/72">{loading ? "Claw 正在检索和整理..." : answer}</div>
            {actions.length ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{actions.slice(0, 3).map((action) => onAppointmentDraft && action.href.startsWith("/appointments") ? <button key={action.id} type="button" onClick={() => { const draft = readAppointmentDraft(action.href); if (draft) onAppointmentDraft(draft); setOpen(false); }} className="shrink-0 rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white">填入预约</button> : <Link key={action.id} href={action.href} className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold text-navy">{action.label}<ChevronRight className="h-3 w-3" /></Link>)}</div> : null}
            <form onSubmit={submit} className="mt-4 flex items-center gap-2">
              <button type="button" onClick={() => setVoiceMode((value) => !value)} aria-label={voiceMode ? "切换键盘" : "切换语音"} className="ios-control flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sage"><Mic className="h-4 w-4" /></button>
              {voiceMode ? <HoldToTalkButton disabled={loading} onTranscript={(text) => { setQuestion(text); setVoiceMode(false); }} onFallback={() => setAnswer("当前浏览器未开放语音识别，请使用键盘输入。小程序中可继续按住说话。")} /> : <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={onAppointmentDraft ? "例如：帮我约下周二下午的家庭医生" : "告诉 Claw 您想办什么"} className="h-11 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-sm outline-none focus:border-sage" />}
              {!voiceMode ? <button disabled={!question.trim() || loading} aria-label="发送" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-white disabled:opacity-40"><Send className="h-4 w-4" /></button> : null}
            </form>
            <Link href="/ask" className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-sage"><MessageCircle className="h-3.5 w-3.5" />进入完整对话</Link>
          </section>
        </>
      ) : null}
    </>
  );
}

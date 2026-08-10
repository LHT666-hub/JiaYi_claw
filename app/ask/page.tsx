"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  BookOpen,
  MessageCircle,
  Mic,
  Send,
  Stethoscope,
} from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { CareSubjectSwitcher } from "@/components/CareSubjectSwitcher";
import { VoiceInputPanel } from "@/components/VoiceInputPanel";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  source?: string;
  nextStep?: string;
  risk?: string;
  suggestDoctor?: boolean;
  actions?: Array<{
    id: string;
    kind: "service" | "schedule" | "public_info" | "progress" | "emergency";
    label: string;
    description: string;
    href: string;
    requiresConfirmation: boolean;
  }>;
};

const sourceLabels: Record<string, string> = {
  safety: "安全分流",
  agent: "Claw 服务编排",
  knowledge: "已审核公开信息",
  knowledge_kimi: "知识库与 AI 整理",
  faq: "服务知识库",
  faq_kimi: "服务知识库与 AI 整理",
  kimi: "AI 通用整理",
  fallback: "安全兜底",
};
export default function AskPage() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "您好，直接告诉我您想办什么。我可以查已核验信息、整理预约或转诊诉求，并把下一步准备好给您确认。",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("q");
    if (initial) setQuestion(initial);
    if (params.get("voice") === "1") setVoiceOpen(true);
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || loading) return;
    setQuestion("");
    setMessages((items) => [
      ...items,
      { id: crypto.randomUUID(), role: "user", text },
    ]);
    setLoading(true);
    try {
      const response = await fetch("/api/v1/assistant/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const payload = await response.json();
      if (response.status === 401) return router.replace("/login");
      if (payload.error?.code === "AI_CONSENT_REQUIRED") {
        setMessages((items) => [
          ...items,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: payload.error.message,
            actions: [
              {
                id: "open-ai-consent",
                kind: "public_info",
                label: "管理 AI 授权",
                description: "授权按当前服务对象单独记录，也可以随时撤回。",
                href: "/privacy",
                requiresConfirmation: false,
              },
            ],
          },
        ]);
        return;
      }
      if (!response.ok)
        throw new Error(payload.error?.message ?? "Claw 暂时无法回答");
      const reply = payload.data.reply;
      setMessages((items) => [
        ...items,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: reply.answer ?? "已收到您的问题。",
          source: reply.source,
          nextStep: reply.nextStep,
          risk: reply.riskLevel,
          suggestDoctor: Boolean(reply.suggestDoctor),
          actions: payload.data.actions ?? [],
        },
      ]);
    } catch (error) {
      setMessages((items) => [
        ...items,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "网络连接失败，请稍后重试。",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }
  return (
    <PhoneShell showBottomNav>
      <div className="mx-auto flex min-h-full w-full flex-col px-4 pb-4 pt-7">
        <header className="flex items-center gap-3 border-b border-line/60 pb-4">
          <button
            onClick={() => router.back()}
            aria-label="返回"
            className="ios-control flex h-11 w-11 items-center justify-center rounded-full text-navy"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="font-brand text-xl font-semibold text-navy">
              问 Claw
            </h1>
            <p className="mt-1 text-xs text-navy/45">
              服务导航与资料整理，不替代医生
            </p>
          </div>
        </header>
        <div className="mt-4">
          <CareSubjectSwitcher compact />
        </div>
        <div className="mt-4 rounded-[22px] border border-danger/15 bg-risk-soft p-3 text-xs leading-5 text-danger">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          胸痛、呼吸困难、意识不清或大出血请立即拨打 120。
        </div>
        <div className="mt-4 flex-1 space-y-3">
          {messages.map((item) => (
            <div
              key={item.id}
              className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[86%] rounded-[24px] px-4 py-3 text-sm leading-6 shadow-[0_10px_26px_rgba(16,42,67,0.07)] ${item.role === "user" ? "rounded-br-[8px] bg-navy text-white" : "rounded-bl-[8px] border border-line/60 bg-surface-card text-navy"}`}
              >
                <p>{item.text}</p>
                {item.nextStep ? (
                  <p className="mt-2 border-t border-line/50 pt-2 text-xs opacity-70">
                    下一步：{item.nextStep}
                  </p>
                ) : null}
                {item.source ? (
                  <p className="mt-2 text-[11px] opacity-50">
                    回答依据：{sourceLabels[item.source] ?? item.source}
                  </p>
                ) : null}
                {item.actions?.length ? (
                  <div className="mt-3 space-y-2 border-t border-line/50 pt-3">
                    {item.actions.map((action, index) => (
                      <Link
                        key={action.id}
                        href={action.href}
                        className={`flex items-center gap-3 rounded-[18px] px-3 py-3 ${action.kind === "emergency" ? "bg-danger text-white" : index === 0 ? "bg-health-soft text-navy" : "border border-line/60 bg-white/70 text-navy"}`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${action.kind === "emergency" ? "bg-white/15" : "bg-white text-sage"}`}
                        >
                          <Stethoscope className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold">
                            {action.label}
                          </span>
                          <span
                            className={`mt-0.5 block text-[11px] leading-4 ${action.kind === "emergency" ? "text-white/75" : "text-navy/48"}`}
                          >
                            {action.description}
                          </span>
                          {action.requiresConfirmation ? (
                            <span className="mt-1 block text-[10px] font-semibold text-sage">
                              需您核对确认后提交
                            </span>
                          ) : null}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 opacity-45" />
                      </Link>
                    ))}
                  </div>
                ) : item.suggestDoctor ? (
                  <Link
                    href="/appointments"
                    className="mt-3 flex items-center justify-center gap-1 rounded-full bg-health-soft px-3 py-2 text-xs font-semibold text-sage"
                  >
                    <Stethoscope className="h-3.5 w-3.5" />
                    整理后发起服务申请
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="text-sm text-navy/45">Claw 正在整理...</div>
          ) : null}
          <div ref={endRef} />
        </div>
        {messages.length === 1 ? (
          <div className="my-4 grid grid-cols-2 gap-2">
            {[
              "今天有哪些医生坐班？",
              "如何预约家庭医生？",
              "社区最近有什么活动？",
              "帮我整理复诊要问的问题",
            ].map((item) => (
              <button
                key={item}
                onClick={() => setQuestion(item)}
                className="rounded-[22px] border border-line bg-white p-3 text-left text-xs leading-5 text-navy/65 shadow-[0_10px_24px_rgba(16,42,67,0.05)]"
              >
                <BookOpen className="mb-2 h-4 w-4 text-sage" />
                {item}
              </button>
            ))}
          </div>
        ) : null}
        <form
          onSubmit={submit}
          className="sticky bottom-0 mt-4 flex gap-2 rounded-[28px] border border-white/55 bg-surface-nav/88 p-2 shadow-[0_16px_36px_rgba(16,42,67,0.12)] backdrop-blur-2xl"
        >
          <button
            type="button"
            onClick={() => setVoiceOpen(true)}
            aria-label="语音输入"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-health-muted text-sage"
          >
            <Mic className="h-5 w-5" />
          </button>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="问服务、排班、活动或准备材料"
            className="h-12 min-w-0 flex-1 rounded-full border border-line bg-surface-card px-4 text-sm outline-none focus:border-sage"
          />
          <button
            disabled={!question.trim() || loading}
            aria-label="发送"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="text-center text-[11px] text-navy/35">
          <MessageCircle className="mr-1 inline h-3 w-3" />
          默认不保存完整健康对话，仅记录脱敏运行与服务审计
        </p>
        <VoiceInputPanel
          open={voiceOpen}
          onClose={() => setVoiceOpen(false)}
          onConfirm={(text) => setQuestion(text)}
        />
      </div>
    </PhoneShell>
  );
}

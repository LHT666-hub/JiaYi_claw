"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Camera, Mic, Send } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { ChatBubble } from "@/components/ChatBubble";
import { PhoneShell } from "@/components/PhoneShell";
import { SafetyNotice } from "@/components/SafetyNotice";
import { TypingBubble } from "@/components/TypingBubble";
import { useToast } from "@/components/ToastProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/supabase/mvp";
import { getLocalAskReply } from "@/lib/faq";
import {
  STORAGE_CHANGE_EVENT,
  appendAskLog,
  appendDoctorTodo,
  readMergedFaqs,
} from "@/lib/storage";
import { AskReply, ManagedFaqItem, ProfileRow } from "@/lib/types";
import { useClawState } from "@/lib/useClawState";
import { useDemoUser } from "@/lib/useDemoUser";

const DEFAULT_ASK_TIMEOUT_MS = 30000;

const suggestionChips = [
  "药吃完了怎么办？",
  "体检报告怎么看？",
  "我要找李医生",
  "下次随访是什么时候？",
  "我能不能停药？",
];

type AskApiResponse = AskReply & {
  clientFallbacks?: {
    askLogToLocal?: boolean;
    doctorTodoToLocal?: boolean;
    residentName?: string;
  };
};

type AskMode = "local" | "supabase";

function getAskTimeoutMs() {
  const rawValue = process.env.NEXT_PUBLIC_ASK_TIMEOUT_MS;
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed < 1000) {
    return DEFAULT_ASK_TIMEOUT_MS;
  }

  return parsed;
}

function AskPageContent() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const handledInitial = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const requestInFlightRef = useRef(false);
  const timeoutRef = useRef<number[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [faqItems, setFaqItems] = useState<ManagedFaqItem[]>([]);
  const [askMode, setAskMode] = useState<AskMode>("local");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const { state, addAskAssistantMessage, pushAskMessage } = useClawState();
  const { showToast } = useToast();
  const { currentUser } = useDemoUser();
  const mode = searchParams.get("mode");
  const quickQuestion = searchParams.get("q") ?? searchParams.get("question");

  useEffect(() => {
    setFaqItems(readMergedFaqs());

    function syncFaqs() {
      setFaqItems(readMergedFaqs());
    }

    window.addEventListener(STORAGE_CHANGE_EVENT, syncFaqs);
    window.addEventListener("storage", syncFaqs);

    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, syncFaqs);
      window.removeEventListener("storage", syncFaqs);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrapMode() {
      if (!supabase) {
        setAskMode("local");
        setProfile(null);
        return;
      }

      try {
        const currentProfile = await fetchCurrentProfile(supabase);

        if (!active) {
          return;
        }

        if (currentProfile) {
          setProfile(currentProfile);
          setAskMode("supabase");
          return;
        }
      } catch {
        // Fall through to local mode.
      }

      if (active) {
        setProfile(null);
        setAskMode("local");
      }
    }

    void bootstrapMode();

    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.askMessages.length, isLoading]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      timeoutRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  async function fetchAskReply(question: string) {
    const controller = new AbortController();
    const askTimeoutMs = getAskTimeoutMs();
    const abortTimer = window.setTimeout(() => {
      controller.abort();
    }, askTimeoutMs);
    timeoutRef.current.push(abortTimer);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({ question }),
      });

      if (!response.ok) {
        throw new Error("ask_api_failed");
      }

      return (await response.json()) as AskApiResponse;
    } finally {
      window.clearTimeout(abortTimer);
      timeoutRef.current = timeoutRef.current.filter((timer) => timer !== abortTimer);
    }
  }

  function appendLocalDoctorTodo(question: string, reply: AskReply, residentName?: string) {
    if (!reply.suggestDoctor && reply.riskLevel !== "high" && reply.riskLevel !== "emergency") {
      return;
    }

    const fallbackResidentName =
      currentUser?.role === "family"
        ? currentUser.residentName ?? "张阿姨"
        : currentUser?.name ?? profile?.display_name ?? residentName ?? "当前居民";

    appendDoctorTodo({
      id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      residentName: fallbackResidentName,
      question,
      riskLevel: reply.riskLevel,
      status: "pending",
      createdAt: new Date().toISOString(),
      source: reply.source,
    });
  }

  function appendLocalAskHistory(question: string, reply: AskReply) {
    appendAskLog({
      id: `ask-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      question,
      answer: `${reply.answer} ${reply.nextStep}`.trim(),
      source: reply.source,
      category: reply.category,
      riskLevel: reply.riskLevel,
      suggestDoctor: reply.suggestDoctor,
      reason: reply.reason,
      createdAt: new Date().toISOString(),
    });
  }

  async function getReply(question: string) {
    if (askMode === "local") {
      const localReply = getLocalAskReply(question, faqItems);
      if (localReply) {
        return {
          ...localReply,
          clientFallbacks: {
            askLogToLocal: true,
            doctorTodoToLocal: true,
            residentName: profile?.display_name ?? currentUser?.name ?? "当前居民",
          },
        } as AskApiResponse;
      }
    }

    return fetchAskReply(question);
  }

  async function scheduleClawReply(question: string) {
    const trimmed = question.trim();

    if (!trimmed || requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
    pushAskMessage(currentUser?.name ?? profile?.display_name ?? "张阿姨", "user", trimmed);
    setIsLoading(true);
    setInput("");

    try {
      const minDelay = 800 + Math.floor(Math.random() * 401);
      const [reply] = await Promise.all([
        getReply(trimmed),
        new Promise((resolve) => {
          const timer = window.setTimeout(resolve, minDelay);
          timeoutRef.current.push(timer);
        }),
      ]);

      if (!mountedRef.current) {
        return;
      }

      if (reply.clientFallbacks?.doctorTodoToLocal) {
        appendLocalDoctorTodo(trimmed, reply, reply.clientFallbacks.residentName);
      }

      if (reply.clientFallbacks?.askLogToLocal) {
        appendLocalAskHistory(trimmed, reply);
      }

      pushAskMessage(
        "家医 Claw",
        "assistant",
        `${reply.answer} ${reply.nextStep}`.trim(),
        reply.riskLevel,
        reply.source,
        reply.reason,
      );
    } catch {
      if (!mountedRef.current) {
        return;
      }

      const fallbackReply = {
        answer: "当前智能问答响应较慢，请稍后再试。",
        nextStep: "您也可以先查看常见问题，或联系家庭医生。",
        suggestDoctor: false,
        riskLevel: "low",
        category: "兜底提示",
        source: "fallback",
        reason: "unknown",
      } as AskReply;

      appendLocalAskHistory(trimmed, fallbackReply);
      addAskAssistantMessage(
        `${fallbackReply.answer} ${fallbackReply.nextStep}`.trim(),
        "low",
        "fallback",
        "unknown",
      );
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    const signature = `${mode ?? ""}::${quickQuestion ?? ""}`;

    if (handledInitial.current === signature) {
      return;
    }

    handledInitial.current = signature;

    if (mode === "voice") {
      addAskAssistantMessage("我正在听，您可以说：药吃完了怎么办？", "low", "fallback");
    }

    if (mode === "photo") {
      addAskAssistantMessage(
        "可以拍体检单、药盒、通知单。当前为原型演示，不做真实识别。",
        "low",
        "fallback",
      );
    }

    if (quickQuestion) {
      void scheduleClawReply(quickQuestion);
    }
  }, [addAskAssistantMessage, mode, quickQuestion]);

  function submitQuestion(question: string) {
    void scheduleClawReply(question);
  }

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-44">
        <BackHeader
          sticky
          title="问家医 Claw"
          subtitle="流程问题、配药规则、体检报告、随访安排，都可以先问我。"
        />

        <SafetyNotice tone="danger">
          Claw 不能提供诊断、处方、停药、换药或个体化治疗建议，遇到紧急情况请立即就医。
        </SafetyNotice>

        <div className="flex flex-wrap gap-2">
          {suggestionChips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => submitQuestion(chip)}
              disabled={isLoading}
              className="rounded-full border border-line bg-cream px-3 py-1.5 text-xs font-semibold text-navy"
            >
              {chip}
            </button>
          ))}
        </div>

        <section className="space-y-4">
          {state.askMessages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
          {isLoading ? (
            <div className="mr-auto max-w-[88%]">
              <p className="mb-1.5 text-xs font-semibold text-navy/55">家医 Claw</p>
              <div className="rounded-[22px] border border-line/70 bg-[#FFF8ED] px-4 py-3 shadow-soft">
                <p className="text-sm text-navy/70">Claw 正在整理回答…</p>
                <div className="mt-2 flex gap-1.5">
                  <span className="typing-dot bg-sage/60" />
                  <span className="typing-dot typing-dot-delay-1 bg-sage/60" />
                  <span className="typing-dot typing-dot-delay-2 bg-sage/60" />
                </div>
              </div>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </section>
      </div>

      <div className="absolute inset-x-0 bottom-0 border-t border-line bg-[#F7E8D4]/96 px-4 pb-6 pt-3 backdrop-blur-sm">
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (isLoading) {
                return;
              }
              addAskAssistantMessage(
                "我正在听，您可以说：药吃完了怎么办？（原型演示，不接真实语音识别）",
                "low",
                "fallback",
              );
              showToast("原型演示：按住说话仅作界面展示。", "info");
            }}
            className="flex h-11 items-center gap-2 rounded-full border border-line bg-cream px-4 text-sm font-semibold text-navy"
          >
            <Mic className="h-4 w-4" />
            按住说话
          </button>
          <button
            type="button"
            onClick={() => {
              if (isLoading) {
                return;
              }
              addAskAssistantMessage(
                "可以拍体检单、药盒、通知单。当前为原型演示，不做真实识别。",
                "low",
                "fallback",
              );
              showToast("原型演示：拍照问问仅作界面展示。", "info");
            }}
            className="flex h-11 items-center gap-2 rounded-full border border-line bg-cream px-4 text-sm font-semibold text-navy"
          >
            <Camera className="h-4 w-4" />
            拍照问问
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-[24px] border border-line bg-cream px-3 py-1.5">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={isLoading}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !isLoading) {
                submitQuestion(input);
              }
            }}
            placeholder="输入问题，例如：药吃完了怎么办？"
            className="h-12 flex-1 border-0 bg-transparent text-[15px] text-navy outline-none placeholder:text-navy/40"
          />
          <button
            type="button"
            onClick={() => submitQuestion(input)}
            disabled={isLoading || !input.trim()}
            className={`flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-white transition ${
              isLoading || !input.trim() ? "bg-navy/40" : "bg-navy active:scale-95"
            }`}
          >
            {isLoading ? <span className="text-xs font-semibold">…</span> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </PhoneShell>
  );
}

export default function AskPage() {
  return (
    <Suspense
      fallback={
        <PhoneShell>
          <div className="space-y-5 px-4 pb-44">
            <BackHeader
              sticky
              title="问家医 Claw"
              subtitle="流程问题、配药规则、体检报告、随访安排，都可以先问我。"
            />
            <SafetyNotice tone="danger">
              Claw 不能提供诊断、处方、停药、换药或个体化治疗建议，遇到紧急情况请立即就医。
            </SafetyNotice>
          </div>
        </PhoneShell>
      }
    >
      <AskPageContent />
    </Suspense>
  );
}

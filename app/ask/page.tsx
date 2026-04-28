"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Camera, Mic, Send } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { ChatBubble } from "@/components/ChatBubble";
import { PhoneShell } from "@/components/PhoneShell";
import { SafetyNotice } from "@/components/SafetyNotice";
import { TypingBubble } from "@/components/TypingBubble";
import { useToast } from "@/components/ToastProvider";
import { AskReply } from "@/lib/types";
import { useClawState } from "@/lib/useClawState";

const suggestionChips = [
  "药吃完了怎么办",
  "体检报告怎么看",
  "我要找李医生",
  "下次随访是什么时候",
  "能不能停药",
];

function AskPageContent() {
  const searchParams = useSearchParams();
  const handledInitial = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const requestInFlightRef = useRef(false);
  const timeoutRef = useRef<number[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { state, addAskAssistantMessage, pushAskMessage } = useClawState();
  const { showToast } = useToast();
  const mode = searchParams.get("mode");
  const quickQuestion = searchParams.get("q") ?? searchParams.get("question");

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
    const abortTimer = window.setTimeout(() => {
      controller.abort();
    }, 10000);
    timeoutRef.current.push(abortTimer);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          question,
        }),
      });

      if (!response.ok) {
        throw new Error("ask_api_failed");
      }

      return (await response.json()) as AskReply;
    } finally {
      window.clearTimeout(abortTimer);
      timeoutRef.current = timeoutRef.current.filter((timer) => timer !== abortTimer);
    }
  }

  async function scheduleClawReply(question: string) {
    const trimmed = question.trim();

    if (!trimmed || requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
    pushAskMessage("张阿姨", "user", trimmed);
    setIsLoading(true);
    setInput("");

    try {
      const minDelay = 800 + Math.floor(Math.random() * 401);
      const [reply] = await Promise.all([
        fetchAskReply(trimmed),
        new Promise((resolve) => {
          const timer = window.setTimeout(resolve, minDelay);
          timeoutRef.current.push(timer);
        }),
      ]);

      if (!mountedRef.current) {
        return;
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

      addAskAssistantMessage(
        "当前智能问答响应较慢，请稍后再试。您也可以先查看常见问题，或联系家庭医生。",
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
      addAskAssistantMessage(
        "我正在听，您可以说：药吃完了怎么办？",
        "low",
        "fallback",
      );
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
          title="问家医 Claw"
          subtitle="流程问题、配药规则、体检报告、随访安排，可以先问我"
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

        <section className="space-y-3">
          {state.askMessages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
          {isLoading ? <TypingBubble author="家医 Claw" /> : null}
          <div ref={messagesEndRef} />
        </section>
      </div>

      <div className="absolute inset-x-0 bottom-0 border-t border-line bg-[#F7E8D4]/96 px-4 pb-6 pt-4 backdrop-blur-sm">
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
              showToast("原型演示：按住说话仅作界面展示", "info");
            }}
            className="flex items-center gap-2 rounded-full border border-line bg-cream px-4 py-2 text-sm font-semibold text-navy"
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
              showToast("原型演示：拍照问问仅作界面展示", "info");
            }}
            className="flex items-center gap-2 rounded-full border border-line bg-cream px-4 py-2 text-sm font-semibold text-navy"
          >
            <Camera className="h-4 w-4" />
            拍照问问
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-[24px] border border-line bg-cream px-3 py-2">
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
            className="h-11 flex-1 border-0 bg-transparent text-sm text-navy outline-none"
          />
          <button
            type="button"
            onClick={() => submitQuestion(input)}
            disabled={isLoading || !input.trim()}
            className={`flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-white transition ${
              isLoading || !input.trim()
                ? "bg-navy/55"
                : "bg-navy"
            }`}
          >
            {isLoading ? (
              <span className="text-xs font-semibold">发送中</span>
            ) : (
              <Send className="h-4 w-4" />
            )}
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
              title="问家医 Claw"
              subtitle="流程问题、配药规则、体检报告、随访安排，可以先问我"
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

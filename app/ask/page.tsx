"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Camera, ClipboardList, Mic, Send, Sparkles } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { ChatBubble } from "@/components/ChatBubble";
import { PhoneShell } from "@/components/PhoneShell";
import { SafetyNotice } from "@/components/SafetyNotice";
import { useToast } from "@/components/ToastProvider";
import { VoiceInputPanel } from "@/components/VoiceInputPanel";
import { PhotoQuestionPanel } from "@/components/PhotoQuestionPanel";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/supabase/mvp";
import { getLocalAskReply } from "@/lib/faq";
import { ClawSummary, generateClawSummary } from "@/lib/clawSummary";
import {
  STORAGE_CHANGE_EVENT,
  appendAskLog,
  appendDoctorTodo,
  readDoctorTodos,
  readMergedFaqs,
} from "@/lib/storage";
import { AskReply, DemoDoctorTodo, ManagedFaqItem, ProfileRow } from "@/lib/types";
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
  serviceTodo?: DemoDoctorTodo | null;
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
  const [summary, setSummary] = useState<ClawSummary | null>(null);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [photoPanelOpen, setPhotoPanelOpen] = useState(false);
  const lastExchangeRef = useRef<{ question: string; reply: AskReply } | null>(null);
  const sessionTodoIdsRef = useRef<Set<string>>(new Set());
  const [todoNotices, setTodoNotices] = useState<DemoDoctorTodo[]>([]);
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

    function syncTodoNotices() {
      if (sessionTodoIdsRef.current.size === 0) return;
      const all = readDoctorTodos();
      const updated = all.filter((t) => sessionTodoIdsRef.current.has(t.id));
      if (updated.length > 0) setTodoNotices(updated);
    }

    window.addEventListener(STORAGE_CHANGE_EVENT, syncFaqs);
    window.addEventListener(STORAGE_CHANGE_EVENT, syncTodoNotices);
    window.addEventListener("storage", syncFaqs);
    window.addEventListener("storage", syncTodoNotices);

    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, syncFaqs);
      window.removeEventListener(STORAGE_CHANGE_EVENT, syncTodoNotices);
      window.removeEventListener("storage", syncFaqs);
      window.removeEventListener("storage", syncTodoNotices);
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
  }, [state.askMessages.length, isLoading, todoNotices.length]);

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
        ? currentUser.residentName ?? currentUser.name ?? "当前居民"
        : currentUser?.name ?? profile?.display_name ?? residentName ?? "当前居民";

    const summaryData = generateClawSummary(question, reply);

    const todo: DemoDoctorTodo = {
      id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      residentId:
        currentUser?.role === "resident"
          ? currentUser.id
          : typeof currentUser?.profile?.residentId === "string"
            ? currentUser.profile.residentId
            : undefined,
      residentName: fallbackResidentName,
      question,
      riskLevel: reply.riskLevel,
      status: "pending",
      createdAt: new Date().toISOString(),
      source: reply.source,
      recommendedRole: summaryData.recommendedRole.role,
      recommendedRoleLabel: summaryData.recommendedRole.displayLabel,
      recommendedReason: summaryData.recommendedRole.reason,
      originalQuestion: question,
      clawAnswer: summaryData.clawResponse,
    };

    appendDoctorTodo(todo);
    sessionTodoIdsRef.current.add(todo.id);
    setTodoNotices((prev) => [...prev, todo]);
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
    pushAskMessage(currentUser?.name ?? profile?.display_name ?? "当前用户", "user", trimmed);
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

      const shouldCreateTodo =
        reply.suggestDoctor || reply.riskLevel === "high" || reply.riskLevel === "emergency";

      if (reply.clientFallbacks?.doctorTodoToLocal) {
        appendLocalDoctorTodo(trimmed, reply, reply.clientFallbacks.residentName);
      } else if (reply.serviceTodo) {
        sessionTodoIdsRef.current.add(reply.serviceTodo.id);
        setTodoNotices((prev) => [reply.serviceTodo as DemoDoctorTodo, ...prev]);
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

      if (shouldCreateTodo) {
        lastExchangeRef.current = { question: trimmed, reply };
        addAskAssistantMessage(
          "已为家医团队生成待处理提醒。医生或护士会在工作台看到这条记录。",
          "low",
          "faq",
        );
      } else {
        lastExchangeRef.current = null;
      }
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
      setVoicePanelOpen(true);
    }

    if (mode === "photo") {
      setPhotoPanelOpen(true);
    }

    if (quickQuestion) {
      void scheduleClawReply(quickQuestion);
    }
  }, [addAskAssistantMessage, mode, quickQuestion]);

  const handleSummaryRequest = useCallback(() => {
    if (!lastExchangeRef.current) {
      showToast("暂无可整理的问题记录", "warning");
      return;
    }

    const { question, reply } = lastExchangeRef.current;
    const result = generateClawSummary(question, reply);
    setSummary(result);
    showToast("已为您整理好问题摘要", "success");
  }, [showToast]);

  function handleCopySummary() {
    if (!summary) return;
    void navigator.clipboard.writeText(summary.fullText).then(() => {
      showToast("摘要已复制到剪贴板", "success");
    });
  }

  function handleSendToDoctor() {
    if (!summary || !lastExchangeRef.current) return;

    const { reply } = lastExchangeRef.current;
    const fallbackResidentName =
      currentUser?.name ?? profile?.display_name ?? "当前居民";

    const todo: DemoDoctorTodo = {
      id: `todo-summary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      residentName: fallbackResidentName,
      question: `[Claw 整理] ${summary.residentQuestion}`,
      riskLevel: reply.riskLevel,
      status: "pending",
      createdAt: new Date().toISOString(),
      source: "claw_summary",
      recommendedRole: summary.recommendedRole.role,
      recommendedRoleLabel: summary.recommendedRole.displayLabel,
      recommendedReason: summary.recommendedRole.reason,
      originalQuestion: summary.residentQuestion,
      clawAnswer: summary.clawResponse,
      summary: summary.doctorSummary,
      preparedMaterials: summary.prepareItems,
    };

    appendDoctorTodo(todo);
    sessionTodoIdsRef.current.add(todo.id);
    setTodoNotices((prev) => [...prev, todo]);

    showToast("已生成家医团队待办", "success");
    setSummary(null);
  }

  function submitQuestion(question: string) {
    setSummary(null);
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

        <Link
          href="/ask/history"
          className="flex items-center gap-1.5 text-sm font-semibold text-sage"
        >
          <ClipboardList className="h-4 w-4" />
          提问记录
        </Link>

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
          {state.askMessages.map((message) => {
            const isHighRisk =
              message.role !== "user" &&
              (message.riskLevel === "high" || message.riskLevel === "emergency" || message.source === "safety");
            return (
              <ChatBubble
                key={message.id}
                message={message}
                onSummaryRequest={isHighRisk ? handleSummaryRequest : undefined}
              />
            );
          })}
          {isLoading ? (
            <div className="mr-auto max-w-[88%]">
              <p className="mb-1.5 text-xs font-semibold text-navy/55">家医 Claw</p>
              <div className="rounded-[22px] border border-line/70 bg-surface-card px-4 py-3 shadow-soft">
                <p className="text-sm text-navy/70">Claw 正在整理回答…</p>
                <div className="mt-2 flex gap-1.5">
                  <span className="typing-dot bg-sage/60" />
                  <span className="typing-dot typing-dot-delay-1 bg-sage/60" />
                  <span className="typing-dot typing-dot-delay-2 bg-sage/60" />
                </div>
              </div>
            </div>
          ) : null}
          {summary ? (
            <div className="rounded-[24px] border border-sage/30 bg-health-soft p-4 shadow-soft animate-in">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-sage" />
                <p className="text-sm font-semibold text-navy">Claw 整理的问题摘要</p>
              </div>
              <div className="space-y-3 text-sm leading-6 text-navy/80">
                <div>
                  <p className="text-xs font-semibold text-navy/50">居民原始问题</p>
                  <p className="mt-1">{summary.residentQuestion}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-navy/50">Claw 已给出的回答</p>
                  <p className="mt-1">{summary.clawResponse}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-navy/50">为什么建议联系家医团队</p>
                  <p className="mt-1">{summary.whySuggestDoctor}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-navy/50">建议准备的材料</p>
                  <ul className="mt-1 space-y-1">
                    {summary.prepareItems.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-[14px] border border-sage/20 bg-[#E2EDE8] px-3 py-2.5">
                  <p className="text-xs font-semibold text-sage">
                    建议处理：{summary.recommendedRole.displayLabel}（{summary.recommendedRole.roleLabel}）
                  </p>
                  <p className="mt-0.5 text-xs text-navy/60">
                    {summary.recommendedRole.reason}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-navy/50">给医生看的简短说明</p>
                  <p className="mt-1 text-[13px] leading-6 text-navy/70">{summary.doctorSummary}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSendToDoctor}
                  className="flex items-center gap-1.5 rounded-full bg-navy px-4 py-2.5 text-xs font-semibold text-white active:scale-95"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  生成家医团队待办
                </button>
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="flex items-center gap-1.5 rounded-full border border-line bg-cream px-3 py-2.5 text-xs font-semibold text-navy active:scale-95"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  复制摘要
                </button>
                <button
                  type="button"
                  onClick={() => setSummary(null)}
                  className="rounded-full border border-line/70 bg-cream/60 px-3 py-2.5 text-xs font-semibold text-navy/60 active:scale-95"
                >
                  关闭
                </button>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-navy/40">
                摘要由 Claw 自动整理，不含诊断或处方建议。医生收到后会根据实际情况判断。
              </p>
            </div>
          ) : null}
          {todoNotices.length > 0 ? (
            <div className="space-y-3">
              {todoNotices.map((todo) => (
                <TodoNoticeCard key={todo.id} todo={todo} />
              ))}
              <div className="text-center">
                <Link
                  href="/me"
                  className="text-xs font-semibold text-sage underline underline-offset-4"
                >
                  在「我的」中查看全部提醒
                </Link>
              </div>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </section>
      </div>

      {voicePanelOpen ? (
        <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4">
          <VoiceInputPanel
            open={voicePanelOpen}
            onClose={() => setVoicePanelOpen(false)}
            onConfirm={(text) => submitQuestion(text)}
          />
        </div>
      ) : null}

      {photoPanelOpen ? (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-[#F3DDC2]/95 px-4 pb-4 pt-4 backdrop-blur-sm">
          <PhotoQuestionPanel
            open={photoPanelOpen}
            onClose={() => setPhotoPanelOpen(false)}
            onConfirm={(question) => submitQuestion(question)}
          />
        </div>
      ) : null}

      <div className={`absolute inset-x-0 bottom-0 border-t border-line bg-surface-nav/96 px-4 pb-6 pt-3 backdrop-blur-sm transition ${voicePanelOpen || photoPanelOpen ? "pointer-events-none opacity-0" : ""}`}>
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (isLoading) return;
              setVoicePanelOpen(true);
            }}
            className="flex h-11 items-center gap-2 rounded-full border border-line bg-cream px-4 text-sm font-semibold text-navy active:scale-95"
          >
            <Mic className="h-4 w-4" />
            语音输入
          </button>
          <button
            type="button"
            onClick={() => {
              if (isLoading) return;
              setPhotoPanelOpen(true);
            }}
            className="flex h-11 items-center gap-2 rounded-full border border-line bg-cream px-4 text-sm font-semibold text-navy active:scale-95"
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

const todoStatusConfig: Record<string, { label: string; style: string }> = {
  pending: { label: "待处理", style: "bg-amber/15 text-amber border-amber/20" },
  processing: { label: "处理中", style: "bg-health-muted text-sage border-sage/20" },
  done: { label: "已处理", style: "bg-health-success text-success border-success/20" },
  ignored: { label: "已忽略", style: "bg-navy/8 text-navy/50 border-navy/10" },
};

function TodoNoticeCard({ todo }: { todo: DemoDoctorTodo }) {
  const statusInfo = todoStatusConfig[todo.status] ?? todoStatusConfig.pending;
  const displayRole = todo.recommendedRoleLabel ?? todo.recommendedRole ?? "家庭医生";
  const time = new Date(todo.createdAt).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="rounded-[22px] border border-sage/25 bg-health-soft p-4 shadow-soft animate-in">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-navy">已为您生成家医团队提醒</p>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusInfo.style}`}>
          {statusInfo.label}
        </span>
      </div>
      <div className="mt-3 space-y-2 text-sm leading-6 text-navy/72">
        <div className="flex items-center justify-between">
          <span className="text-xs text-navy/50">建议处理人</span>
          <span className="text-xs font-semibold text-sage">{displayRole}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-navy/50">提醒时间</span>
          <span className="text-xs text-navy/60">{time}</span>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-navy/40">
        家医 Claw 不替代医生判断，家医团队处理后会更新状态。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/service-progress"
          className="rounded-full bg-navy px-3 py-2 text-xs font-semibold text-white"
        >
          查看处理进度
        </Link>
        <Link
          href="/contacts"
          className="rounded-full border border-line bg-cream px-3 py-2 text-xs font-semibold text-navy"
        >
          一键找人
        </Link>
        <Link
          href="/ask"
          className="rounded-full border border-line bg-cream px-3 py-2 text-xs font-semibold text-navy"
        >
          让 Claw 帮我整理问题
        </Link>
      </div>
    </div>
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

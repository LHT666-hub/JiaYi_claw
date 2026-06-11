"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Camera,
  ClipboardList,
  Mic,
  Pill,
  Send,
  Sparkles,
  Stethoscope,
  UserRoundPlus,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { ChatBubble } from "@/components/ChatBubble";
import { PhoneShell } from "@/components/PhoneShell";
import { SafetyNotice } from "@/components/SafetyNotice";
import { useToast } from "@/components/ToastProvider";
import { VoiceInputPanel } from "@/components/VoiceInputPanel";
import { PhotoQuestionPanel } from "@/components/PhotoQuestionPanel";
import {
  buildPersistedServiceTask,
  buildServiceTaskTitle,
  encodeDescriptionWithServiceTask,
} from "@/lib/agentTaskPayload";
import { inferServiceRequestFromQuestion } from "@/lib/agent";
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
import {
  AgentResult,
  AgentTaskCard,
  AskReply,
  DemoDoctorTodo,
  ManagedFaqItem,
  ProfileRow,
  ServiceRequestPayload,
} from "@/lib/types";
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
  agentResult?: AgentResult | null;
};

type AskMode = "local" | "supabase";

function buildServiceRequestFromSearchParams(searchParams: URLSearchParams): ServiceRequestPayload | null {
  const serviceType = searchParams.get("serviceType");

  if (serviceType === "registration") {
    return {
      kind: "registration",
      symptom: searchParams.get("symptom") ?? "",
      department: searchParams.get("department") ?? "",
      preferredDate: searchParams.get("preferredDate") ?? "",
      preferredTime: searchParams.get("preferredTime") ?? "",
      preferredDoctor: searchParams.get("preferredDoctor") ?? "",
    };
  }

  if (serviceType === "refill") {
    const deliveryMethod = searchParams.get("deliveryMethod");
    return {
      kind: "refill",
      medicineName: searchParams.get("medicineName") ?? "",
      disease: searchParams.get("disease") ?? "",
      stockLeft: searchParams.get("stockLeft") ?? "",
      deliveryMethod:
        deliveryMethod === "pickup" || deliveryMethod === "mail" || deliveryMethod === "either"
          ? deliveryMethod
          : "either",
    };
  }

  if (serviceType === "familyDoctor") {
    const serviceMode = searchParams.get("serviceMode");
    return {
      kind: "family_doctor",
      serviceMode:
        serviceMode === "clinic" ||
        serviceMode === "phone" ||
        serviceMode === "home_visit" ||
        serviceMode === "either"
          ? serviceMode
          : "either",
      preferredDate: searchParams.get("preferredDate") ?? "",
      preferredTime: searchParams.get("preferredTime") ?? "",
      note: searchParams.get("note") ?? "",
    };
  }

  if (serviceType === "dispenseStatus") {
    const deliveryMethod = searchParams.get("deliveryMethod");
    const progressFocus = searchParams.get("progressFocus");
    return {
      kind: "dispense_status",
      medicineName: searchParams.get("medicineName") ?? "",
      deliveryMethod:
        deliveryMethod === "pickup" || deliveryMethod === "mail" || deliveryMethod === "either"
          ? deliveryMethod
          : "either",
      progressFocus:
        progressFocus === "review" ||
        progressFocus === "dispense" ||
        progressFocus === "delivery" ||
        progressFocus === "any"
          ? progressFocus
          : "any",
    };
  }

  if (serviceType === "followup") {
    const followupType = searchParams.get("followupType");
    return {
      kind: "followup",
      followupType:
        followupType === "clinic_review" ||
        followupType === "phone_followup" ||
        followupType === "checkup" ||
        followupType === "medication_reminder"
          ? followupType
          : "clinic_review",
      preferredDate: searchParams.get("preferredDate") ?? "",
      note: searchParams.get("note") ?? "",
    };
  }

  return null;
}

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
  const [agentResults, setAgentResults] = useState<AgentResult[]>([]);
  const lastExchangeRef = useRef<{ question: string; reply: AskReply } | null>(null);
  const sessionTodoIdsRef = useRef<Set<string>>(new Set());
  const [todoNotices, setTodoNotices] = useState<DemoDoctorTodo[]>([]);
  const { state, addAskAssistantMessage, pushAskMessage } = useClawState();
  const { showToast } = useToast();
  const { currentUser } = useDemoUser();
  const mode = searchParams.get("mode");
  const quickQuestion = searchParams.get("q") ?? searchParams.get("question");
  const initialServiceRequest = useMemo(
    () => buildServiceRequestFromSearchParams(searchParams),
    [searchParams],
  );

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

  const fetchAskReply = useCallback(async (question: string, serviceRequest?: ServiceRequestPayload | null) => {
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
        body: JSON.stringify({ question, serviceRequest: serviceRequest ?? null }),
      });

      if (!response.ok) {
        throw new Error("ask_api_failed");
      }

      return (await response.json()) as AskApiResponse;
    } finally {
      window.clearTimeout(abortTimer);
      timeoutRef.current = timeoutRef.current.filter((timer) => timer !== abortTimer);
    }
  }, []);

  const appendLocalDoctorTodo = useCallback((
    question: string,
    reply: AskReply,
    residentName?: string,
    serviceRequest?: ServiceRequestPayload | null,
  ) => {
    if (!reply.suggestDoctor && reply.riskLevel !== "high" && reply.riskLevel !== "emergency") {
      return;
    }

    const fallbackResidentName =
      currentUser?.role === "family"
        ? currentUser.residentName ?? currentUser.name ?? "当前居民"
        : currentUser?.name ?? profile?.display_name ?? residentName ?? "当前居民";

    const summaryData = generateClawSummary(question, reply);
    const serviceTask = buildPersistedServiceTask(reply.agentResult, serviceRequest);

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
      summary: summaryData.doctorSummary,
      preparedMaterials: summaryData.prepareItems,
      serviceTask,
    };

    appendDoctorTodo(todo);
    sessionTodoIdsRef.current.add(todo.id);
    setTodoNotices((prev) => [...prev, todo]);
  }, [currentUser?.id, currentUser?.name, currentUser?.profile?.residentId, currentUser?.residentName, currentUser?.role, profile?.display_name]);

  const createRemoteDoctorTodo = useCallback(async (question: string, reply: AskReply, generatedSummary: ClawSummary) => {
    const serviceTask = buildPersistedServiceTask(reply.agentResult);
    const response = await fetch("/api/doctor/todos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        residentId: profile?.role === "resident" ? profile.id : null,
        type: serviceTask ? `service_${serviceTask.task.intent}` : "claw_summary",
        title: serviceTask
          ? buildServiceTaskTitle(serviceTask.task)
          : `[Claw 整理] ${generatedSummary.residentQuestion}`.slice(0, 36),
        description: encodeDescriptionWithServiceTask(generatedSummary.doctorSummary, serviceTask),
        originalQuestion: generatedSummary.residentQuestion,
        clawAnswer: generatedSummary.clawResponse,
        riskLevel: reply.riskLevel,
        source: serviceTask ? "agent" : "claw_summary",
      }),
    });

    if (!response.ok) {
      throw new Error("remote_todo_create_failed");
    }

    const payload = (await response.json().catch(() => ({}))) as {
      todo?: {
        id: string;
        resident_id?: string | null;
        status: DemoDoctorTodo["status"];
        created_at: string;
      };
    };

    if (!payload.todo) {
      throw new Error("remote_todo_missing");
    }

    const remoteTodo: DemoDoctorTodo = {
      id: payload.todo.id,
      residentId: payload.todo.resident_id ?? (profile?.role === "resident" ? profile.id : undefined),
      residentName: profile?.display_name ?? currentUser?.name ?? "当前居民",
      question: `[Claw 整理] ${generatedSummary.residentQuestion}`,
      riskLevel: reply.riskLevel,
      status: payload.todo.status,
      createdAt: payload.todo.created_at,
      source: "claw_summary",
      recommendedRole: generatedSummary.recommendedRole.role,
      recommendedRoleLabel: generatedSummary.recommendedRole.displayLabel,
      recommendedReason: generatedSummary.recommendedRole.reason,
      originalQuestion: generatedSummary.residentQuestion,
      clawAnswer: generatedSummary.clawResponse,
      summary: generatedSummary.doctorSummary,
      preparedMaterials: generatedSummary.prepareItems,
      serviceTask,
    };

    sessionTodoIdsRef.current.add(remoteTodo.id);
    setTodoNotices((prev) => [...prev, remoteTodo]);
  }, [currentUser?.name, profile]);

  const appendLocalAskHistory = useCallback((question: string, reply: AskReply) => {
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
  }, []);

  const getReply = useCallback(async (question: string, serviceRequest?: ServiceRequestPayload | null) => {
    const inferredServiceRequest = serviceRequest ?? inferServiceRequestFromQuestion(question);

    if (askMode === "local") {
      if (inferredServiceRequest) {
        return fetchAskReply(question, inferredServiceRequest);
      }

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

    return fetchAskReply(question, inferredServiceRequest);
  }, [askMode, faqItems, fetchAskReply, profile?.display_name, currentUser?.name]);

  const messageEntries = useMemo(() => {
    let agentIndex = 0;

    return state.askMessages.map((message) => {
      if (message.role === "assistant" && message.source === "agent") {
        const agentResult = agentResults[agentIndex] ?? null;
        agentIndex += 1;
        return { message, agentResult };
      }

      return { message, agentResult: null };
    });
  }, [agentResults, state.askMessages]);

  const scheduleClawReply = useCallback(async (question: string, serviceRequest?: ServiceRequestPayload | null) => {
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
        getReply(trimmed, serviceRequest),
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
        appendLocalDoctorTodo(trimmed, reply, reply.clientFallbacks.residentName, serviceRequest);
      } else if (reply.serviceTodo) {
        sessionTodoIdsRef.current.add(reply.serviceTodo.id);
        setTodoNotices((prev) => [reply.serviceTodo as DemoDoctorTodo, ...prev]);
      }

      if (reply.clientFallbacks?.askLogToLocal) {
        appendLocalAskHistory(trimmed, reply);
      }

      if (reply.agentResult) {
        setAgentResults((prev) => [...prev, reply.agentResult as AgentResult]);
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
  }, [
    addAskAssistantMessage,
    appendLocalAskHistory,
    appendLocalDoctorTodo,
    currentUser?.name,
    getReply,
    profile?.display_name,
    pushAskMessage,
  ]);

  useEffect(() => {
    const signature = `${mode ?? ""}::${quickQuestion ?? ""}::${JSON.stringify(initialServiceRequest ?? {})}`;

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
      void scheduleClawReply(quickQuestion, initialServiceRequest);
    }
  }, [initialServiceRequest, mode, quickQuestion, scheduleClawReply]);

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

    const localTodo: DemoDoctorTodo = {
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

    const summarySnapshot = summary;

    void (async () => {
      try {
        if (askMode === "supabase" && profile) {
          await createRemoteDoctorTodo(summarySnapshot.residentQuestion, reply, summarySnapshot);
        } else {
          appendDoctorTodo(localTodo);
          sessionTodoIdsRef.current.add(localTodo.id);
          setTodoNotices((prev) => [...prev, localTodo]);
        }

        showToast("已生成家医团队待办", "success");
        setSummary(null);
      } catch {
        if (askMode === "supabase" && profile) {
          showToast("家医团队待办暂时还没同步成功，请稍后再试。", "warning");
          return;
        }

        appendDoctorTodo(localTodo);
        sessionTodoIdsRef.current.add(localTodo.id);
        setTodoNotices((prev) => [...prev, localTodo]);
        showToast("已先记录到当前设备，方便继续演示。", "warning");
        setSummary(null);
      }
    })();
  }

  function submitQuestion(question: string, serviceRequest?: ServiceRequestPayload | null) {
    setSummary(null);
    void scheduleClawReply(question, serviceRequest);
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
          {messageEntries.map(({ message, agentResult }) => {
            const isHighRisk =
              message.role !== "user" &&
              (message.riskLevel === "high" || message.riskLevel === "emergency" || message.source === "safety");
            return (
              <div key={message.id} className="space-y-3">
                <ChatBubble
                  message={message}
                  onSummaryRequest={isHighRisk ? handleSummaryRequest : undefined}
                />
                {agentResult ? <AgentResultPanel result={agentResult} /> : null}
              </div>
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

const agentStatusLabelMap: Record<AgentTaskCard["status"], string> = {
  ready: "可继续",
  queued: "待团队确认",
  in_progress: "推进中",
};

const agentUrgencyLabelMap: Record<AgentTaskCard["urgency"], string> = {
  routine: "常规",
  soon: "建议尽快",
  priority: "优先处理",
};

function getAgentIcon(intent: AgentTaskCard["intent"]) {
  if (intent === "refill_request") {
    return Pill;
  }

  if (intent === "followup_reminder") {
    return ClipboardList;
  }

  if (intent === "family_doctor_booking") {
    return UserRoundPlus;
  }

  if (intent === "clinic_registration") {
    return Sparkles;
  }

  return Stethoscope;
}

function getServiceFactValue(card: AgentTaskCard, label: string) {
  return card.serviceFacts?.find((fact) => fact.label === label)?.value ?? "";
}

function buildDoctorRegistrationHref(
  card: AgentTaskCard,
  doctor: NonNullable<AgentTaskCard["doctorOptions"]>[number],
) {
  const preferredSlot = getServiceFactValue(card, "期望时段") || "明天下午";
  const symptomOrTarget =
    getServiceFactValue(card, "预约目标") ||
    doctor.clinicType ||
    doctor.department;
  const prompt = `帮我预约${preferredSlot}看${doctor.department}，优先${doctor.name}，主要想看${symptomOrTarget}`;

  return `/ask?q=${encodeURIComponent(prompt)}&serviceType=registration&symptom=${encodeURIComponent(
    symptomOrTarget,
  )}&department=${encodeURIComponent(doctor.department)}&preferredDate=${encodeURIComponent(
    preferredSlot.replace("上午", "").replace("下午", "").replace("晚上", "").replace("全天", "").trim() || "明天",
  )}&preferredTime=${encodeURIComponent(
    preferredSlot.includes("上午")
      ? "上午"
      : preferredSlot.includes("晚上")
        ? "晚上"
        : preferredSlot.includes("全天")
          ? "全天"
          : "下午",
  )}&preferredDoctor=${encodeURIComponent(doctor.name)}`;
}

function AgentResultPanel({ result }: { result: AgentResult }) {
  return (
    <div className="space-y-3">
      {result.cards.map((card) => (
        <AgentFlowCard key={card.id} card={card} result={result} />
      ))}
    </div>
  );
}

function AgentFlowCard({ card, result }: { card: AgentTaskCard; result: AgentResult }) {
  const Icon = getAgentIcon(card.intent);
  const normalizedCard =
    buildPersistedServiceTask({
      matched: result.matched,
      intent: result.intent,
      label: result.label,
      summary: result.summary,
      needsHumanReview: result.needsHumanReview,
      cards: [card],
    })?.task ?? card;
  const currentStep = normalizedCard.steps.find((step) => step.status === "current");

  return (
    <div className="rounded-[24px] border border-sage/25 bg-[#EEF4EF] p-4 shadow-soft animate-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/75 text-sage shadow-soft">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-navy">{normalizedCard.title}</p>
            <p className="text-xs text-navy/50">{result.label}</p>
          </div>
        </div>
        <span className="rounded-full border border-sage/20 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-sage">
          {agentStatusLabelMap[card.status]}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-navy/75">{normalizedCard.summary}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-navy/65">
        <div className="rounded-[16px] border border-white/70 bg-white/70 px-3 py-2">
          <p className="text-[11px] text-navy/45">建议团队</p>
          <p className="mt-1 font-semibold text-navy">{normalizedCard.recommendedTeam}</p>
        </div>
        <div className="rounded-[16px] border border-white/70 bg-white/70 px-3 py-2">
          <p className="text-[11px] text-navy/45">时效</p>
          <p className="mt-1 font-semibold text-navy">{normalizedCard.eta}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full border border-amber/20 bg-[#FFF3DF] px-2.5 py-1 text-[11px] font-semibold text-amber">
          {agentUrgencyLabelMap[normalizedCard.urgency]}
        </span>
        {result.needsHumanReview ? (
          <span className="rounded-full border border-sage/20 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-sage">
            需要人工协同
          </span>
        ) : (
          <span className="rounded-full border border-sage/20 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-sage">
            可先自助推进
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {normalizedCard.steps.map((step) => (
          <div key={step.title} className="flex items-center gap-2 rounded-[14px] bg-white/70 px-3 py-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                step.status === "done"
                  ? "bg-success"
                  : step.status === "current"
                    ? "bg-sage"
                    : "bg-navy/20"
              }`}
            />
            <p className="flex-1 text-xs font-medium text-navy">{step.title}</p>
            <span className="text-[11px] text-navy/45">{step.owner}</span>
          </div>
        ))}
      </div>

      {normalizedCard.serviceFacts?.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold text-navy/50">服务判断</p>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {normalizedCard.serviceFacts.map((fact) => (
              <div
                key={`${normalizedCard.id}-${fact.label}`}
                className={`rounded-[14px] border px-3 py-2 ${
                  fact.tone === "positive"
                    ? "border-sage/20 bg-white/80"
                    : fact.tone === "warning"
                      ? "border-amber/20 bg-[#FFF6EA]"
                      : "border-white/70 bg-white/70"
                }`}
              >
                <p className="text-[11px] text-navy/45">{fact.label}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-navy">{fact.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {currentStep ? (
        <div className="mt-4 rounded-[16px] border border-sage/20 bg-white/80 px-3 py-3">
          <p className="text-[11px] text-navy/45">当前处理节点</p>
          <p className="mt-1 text-sm font-semibold text-navy">{currentStep.title}</p>
          <p className="mt-1 text-xs text-navy/58">当前由 {currentStep.owner} 跟进处理</p>
        </div>
      ) : null}

      {normalizedCard.doctorOptions?.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold text-navy/50">推荐排班与候选医生</p>
          <div className="mt-2 space-y-2">
            {normalizedCard.doctorOptions.map((doctor) => (
              <div key={doctor.id} className="rounded-[16px] border border-white/70 bg-white/80 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy">{doctor.name}</p>
                    <p className="mt-0.5 text-xs text-navy/55">
                      {doctor.department} · {doctor.clinicType}
                    </p>
                  </div>
                  <span className="rounded-full border border-amber/20 bg-[#FFF3DF] px-2.5 py-0.5 text-[11px] font-semibold text-amber">
                    余号 {doctor.remainingSlots}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-navy/68">{doctor.schedule}</p>
                <p className="mt-1 text-xs leading-5 text-navy/55">擅长：{doctor.specialty}</p>
                <div className="mt-3 flex gap-2">
                  <Link
                    href={buildDoctorRegistrationHref(normalizedCard, doctor)}
                    className="rounded-full bg-navy px-3 py-1.5 text-[11px] font-semibold text-white"
                  >
                    立即预约
                  </Link>
                  <Link
                    href="/contacts"
                    className="rounded-full border border-line bg-cream px-3 py-1.5 text-[11px] font-semibold text-navy"
                  >
                    联系团队
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {normalizedCard.preparedMaterials.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold text-navy/50">建议先准备</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {normalizedCard.preparedMaterials.map((item) => (
              <span
                key={item}
                className="rounded-full border border-line/70 bg-cream px-3 py-1 text-[11px] font-semibold text-navy/70"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {normalizedCard.serviceWindow ? (
        <p className="mt-3 text-[11px] leading-5 text-navy/45">{normalizedCard.serviceWindow}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {normalizedCard.actions.map((action) => (
          <Link
            key={`${normalizedCard.id}-${action.label}`}
            href={action.href}
            className={
              action.kind === "primary"
                ? "rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white"
                : "rounded-full border border-line bg-cream px-4 py-2 text-xs font-semibold text-navy"
            }
          >
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

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

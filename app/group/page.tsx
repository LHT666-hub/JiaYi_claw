"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { House, ImagePlus, Mic, Send, Sparkles, UserRoundPlus } from "lucide-react";
import { ChatBubble } from "@/components/ChatBubble";
import { PhoneShell } from "@/components/PhoneShell";
import { SafetyNotice } from "@/components/SafetyNotice";
import { SectionCard } from "@/components/SectionCard";
import { TypingBubble } from "@/components/TypingBubble";
import { useToast } from "@/components/ToastProvider";
import { getGroupMessages } from "@/lib/db/groupMessages";
import { getClawReply } from "@/lib/faq";
import { readMatchedLeader, STORAGE_CHANGE_EVENT } from "@/lib/storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/supabase/mvp";
import { ChatMessage, ProfileRow, RiskLevel } from "@/lib/types";
import { useClawState } from "@/lib/useClawState";
import { useDemoUser } from "@/lib/useDemoUser";

const GROUP_ID = "hypertension-haiwan";
const commonQuestions = [
  "血压高了怎么办",
  "药吃完了怎么办",
  "体检报告看不懂",
  "今天小课是什么",
];

const seedMessages: ChatMessage[] = [
  {
    id: "group-seed-1",
    author: "Claw 群助手",
    role: "assistant",
    content: "早上好。今天的小课堂是《高血压药为什么不能随便停》，看完可以领积分。",
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    context: "group",
    riskLevel: "low",
  },
  {
    id: "group-seed-2",
    author: "王阿姨组长",
    role: "leader",
    content: "大家今天记得量一次血压，量完可以在群里打个卡，写清时间和数值就行。",
    createdAt: new Date(Date.now() - 1000 * 60 * 36).toISOString(),
    context: "group",
  },
  {
    id: "group-seed-3",
    author: "群友",
    role: "user",
    content: "我早上量了 135/82，已经打卡。",
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    context: "group",
  },
  {
    id: "group-seed-4",
    author: "王护士",
    role: "nurse",
    content: "收到。大家记录时写清时间、数值和身体感受，不要因为一次偏高就自行加药。",
    createdAt: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
    context: "group",
    riskLevel: "medium",
  },
  {
    id: "group-seed-5",
    author: "李医生",
    role: "doctor",
    content: "如果血压持续明显升高，或者伴随胸痛、呼吸困难、肢体无力、言语不清，请及时就医。",
    createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    context: "group",
    riskLevel: "high",
  },
  {
    id: "group-seed-6",
    author: "Claw 群助手",
    role: "assistant",
    content: "流程、体检、配药、小课堂可以先问我；诊断、调药、报告严重程度请联系家医团队或线下医生。",
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    context: "group",
    riskLevel: "low",
  },
];

function buildLocalMessage(
  author: string,
  role: ChatMessage["role"],
  content: string,
  riskLevel?: RiskLevel,
): ChatMessage {
  return {
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    author,
    role,
    content,
    createdAt: new Date().toISOString(),
    context: "group",
    riskLevel,
  };
}

function mergeWithSeedMessages(localMessages: ChatMessage[]) {
  const userAdded = localMessages.filter((message) => !message.id.startsWith("group-seed-"));
  return [...seedMessages, ...userAdded];
}

export default function GroupPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [showQuestions, setShowQuestions] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(seedMessages);
  const [isRemoteMode, setIsRemoteMode] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<number[]>([]);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { currentUser } = useDemoUser();
  const { state, completeGroupCheckIn, pushGroupMessage } = useClawState();
  const { showToast } = useToast();
  const [matchedLeaderName, setMatchedLeaderName] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      setMatchedLeaderName(readMatchedLeader()?.leaderName ?? null);
    }
    refresh();
    window.addEventListener(STORAGE_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    if (!isRemoteMode) {
      setMessages(mergeWithSeedMessages(state.groupMessages));
    }
  }, [isRemoteMode, state.groupMessages]);

  useEffect(() => {
    let active = true;

    async function loadRemoteMessages() {
      if (!supabase) {
        return;
      }

      const currentProfile = await fetchCurrentProfile(supabase);

      if (!active || !currentProfile) {
        return;
      }

      setProfile(currentProfile);
      const remoteMessages = await getGroupMessages(GROUP_ID, supabase);

      if (!active || !remoteMessages.length) {
        return;
      }

      setMessages(remoteMessages);
      setIsRemoteMode(true);
    }

    void loadRemoteMessages();

    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isThinking]);

  useEffect(
    () => () => {
      timeoutRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  async function persistUserMessage(content: string) {
    const authorName = profile?.display_name ?? currentUser?.name ?? "当前用户";

    if (!isRemoteMode || !profile) {
      pushGroupMessage(authorName, "user", content);
      const localMessage = buildLocalMessage(authorName, "user", content);
      setMessages((current) => [...current, localMessage]);
      return localMessage;
    }

    const response = await fetch("/api/group/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        groupId: GROUP_ID,
        content,
        senderName: authorName,
        senderRole: profile.role,
      }),
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      message?: ChatMessage;
      messageText?: string;
    };

    if (!response.ok || !payload.ok || !payload.message) {
      showToast("暂时没有连上小组服务，已先在当前页面显示。", "warning");
      pushGroupMessage(authorName, "user", content);
      const localMessage = buildLocalMessage(authorName, "user", content);
      setMessages((current) => [...current, localMessage]);
      return localMessage;
    }

    setMessages((current) => [...current, payload.message as ChatMessage]);
    return payload.message as ChatMessage;
  }

  function appendAssistantReply(content: string, riskLevel?: RiskLevel) {
    const assistantMessage = buildLocalMessage("Claw 群助手", "assistant", content, riskLevel);
    setMessages((current) => [...current, assistantMessage]);

    if (!isRemoteMode) {
      pushGroupMessage("Claw 群助手", "assistant", content, riskLevel);
    }
  }

  async function submitMessage(content: string) {
    const trimmed = content.trim();

    if (!trimmed) {
      return;
    }

    const reply =
      trimmed === "今天小课是什么"
        ? {
            answer: "今天的小课堂是《高血压药为什么不能随便停》，看完可得 5 分。",
            nextStep: "看完后可以顺手完成今天的小课堂积分。",
            riskLevel: "low" as const,
          }
        : getClawReply(trimmed);

    await persistUserMessage(trimmed);
    setIsThinking(true);
    setInput("");
    setShowQuestions(false);

    const timer = window.setTimeout(() => {
      appendAssistantReply(`${reply.answer} ${reply.nextStep}`.trim(), reply.riskLevel);
      setIsThinking(false);
    }, 800 + Math.floor(Math.random() * 401));

    timeoutRef.current.push(timer);
  }

  async function handleCheckIn() {
    const changed = completeGroupCheckIn();

    if (!changed) {
      showToast("今天已经打过卡了", "warning");
      return;
    }

    await persistUserMessage("我来打卡了，今天量了血压。");
    appendAssistantReply("已完成今日小组打卡。记录只用于日常健康管理参考，不能替代医生判断。", "low");
    showToast("已完成今日小组打卡，+5 分", "success");
  }

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-[18rem]">
        <header className="sticky top-0 z-20 -mx-4 border-b border-line/70 bg-[#F7E8D4]/95 px-5 pb-3 pt-6 text-center backdrop-blur-sm">
          <Link
            href="/"
            className="absolute left-5 top-6 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-cream text-navy shadow-soft active:scale-95"
            aria-label="回到首页"
          >
            <House className="h-5 w-5" strokeWidth={2.1} />
          </Link>
          <h1 className="px-14 text-xl font-semibold text-navy">高血压互助小组</h1>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-navy/60">
            <span className="rounded-full bg-sage/15 px-2 py-0.5 font-medium text-sage">
              家医团队在群
            </span>
            <span>组长：{matchedLeaderName ?? "王阿姨"}</span>
            <span className="font-semibold text-navy/75">今日 12 人已打卡</span>
          </div>
        </header>

        <SectionCard>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-[22px] bg-[#FFF8ED] px-3 py-4">
              <p className="text-xs tracking-[0.14em] text-navy/55">家医团队</p>
              <p className="mt-2 text-sm font-semibold text-navy">在群提醒</p>
            </div>
            <div className="rounded-[22px] bg-[#FFF8ED] px-3 py-4">
              <p className="text-xs tracking-[0.14em] text-navy/55">组长</p>
              <p className="mt-2 text-sm font-semibold text-navy">{matchedLeaderName ?? "王阿姨"}</p>
              {!matchedLeaderName ? (
                <a
                  href="/match-leader"
                  className="mt-1 flex items-center justify-center gap-0.5 text-[10px] font-medium text-sage"
                >
                  <UserRoundPlus className="h-3 w-3" />
                  匹配
                </a>
              ) : null}
            </div>
            <div className="rounded-[22px] bg-[#FFF8ED] px-3 py-4">
              <p className="text-xs tracking-[0.14em] text-navy/55">今日打卡</p>
              <p className="mt-2 text-sm font-semibold text-navy">12 人</p>
            </div>
          </div>
        </SectionCard>

        <SafetyNotice tone="danger">
          今日提醒：今天记得量一次血压。若血压持续明显升高，建议联系家庭医生；如伴随胸痛、呼吸困难、肢体无力、言语不清等情况，请立即就医。
        </SafetyNotice>

        <SectionCard title="群消息">
          <div className="space-y-3">
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            {isThinking ? <TypingBubble author="Claw 群助手" /> : null}
            <div ref={messagesEndRef} />
          </div>
        </SectionCard>

        {!isRemoteMode ? (
          <p className="px-1 text-xs leading-5 text-navy/52">
            当前为演示消息，正式试用时会显示真实小组内容。
          </p>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-4 pt-3">
        {showQuestions ? (
          <div className="mb-3 rounded-[28px] border border-line bg-cream p-4 shadow-soft">
            <p className="text-sm font-semibold text-navy">常见问题</p>
            <div className="mt-3 grid gap-2">
              {commonQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void submitMessage(question)}
                  className="rounded-full border border-line bg-[#FFF8ED] px-4 py-2 text-left text-sm text-navy"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-t-[32px] rounded-b-[26px] border border-line bg-[#FBF1E2]/98 p-3 shadow-float backdrop-blur-sm">
          <div className="mb-3 grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => router.push("/ask?mode=voice")}
              className="flex min-h-[46px] items-center justify-center gap-1 rounded-full border border-line bg-cream px-3 py-2 text-sm font-semibold text-navy active:scale-95"
            >
              <Mic className="h-4 w-4" />
              <span className="hidden sm:inline">语音问</span>
              <span className="sm:hidden">语音</span>
            </button>
            <button
              type="button"
              onClick={() => router.push("/ask?mode=photo")}
              className="flex min-h-[46px] items-center justify-center gap-1 rounded-full border border-line bg-cream px-3 py-2 text-sm font-semibold text-navy active:scale-95"
            >
              <ImagePlus className="h-4 w-4" />
              发图片
            </button>
            <button
              type="button"
              onClick={() => setShowQuestions((current) => !current)}
              className="min-h-[46px] rounded-full border border-line bg-cream px-3 py-2 text-sm font-semibold text-navy"
            >
              常见问题
            </button>
            <button
              type="button"
              onClick={() => void handleCheckIn()}
              className="min-h-[46px] rounded-full bg-navy px-3 py-2 text-sm font-semibold text-white"
            >
              打卡
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-[22px] border border-line bg-cream px-3 py-1.5">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void submitMessage(input);
                }
              }}
              placeholder="和小组说一句"
              className="h-12 flex-1 border-0 bg-transparent text-[15px] text-navy outline-none placeholder:text-navy/40"
            />
            <button
              type="button"
              onClick={() => void submitMessage(input)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-white active:scale-95"
            >
              <Send className="h-4.5 w-4.5" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-navy/52">
            <Sparkles className="h-3.5 w-3.5" />
            健康小组适合提醒、打卡和流程问题，不替代医生判断。
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}

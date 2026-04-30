"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { House, ImagePlus, Mic, Send, Sparkles } from "lucide-react";
import { ChatBubble } from "@/components/ChatBubble";
import { PhoneShell } from "@/components/PhoneShell";
import { SafetyNotice } from "@/components/SafetyNotice";
import { SectionCard } from "@/components/SectionCard";
import { TypingBubble } from "@/components/TypingBubble";
import { useToast } from "@/components/ToastProvider";
import { getGroupMessages } from "@/lib/db/groupMessages";
import { getClawReply } from "@/lib/faq";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/supabase/mvp";
import { ChatMessage, ProfileRow, RiskLevel } from "@/lib/types";
import { useClawState } from "@/lib/useClawState";

const GROUP_ID = "hypertension-haiwan";
const commonQuestions = [
  "血压高了怎么办",
  "药吃完了怎么办",
  "体检报告看不懂",
  "今天小课是什么",
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

export default function GroupPage() {
  const [input, setInput] = useState("");
  const [showQuestions, setShowQuestions] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSupabaseMode, setIsSupabaseMode] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<number[]>([]);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { state, addGroupExchange, completeGroupCheckIn, pushGroupMessage } = useClawState();
  const { showToast } = useToast();

  useEffect(() => {
    setMessages(state.groupMessages);
  }, [state.groupMessages]);

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
      setIsSupabaseMode(true);
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
    if (!isSupabaseMode || !profile) {
      pushGroupMessage("张阿姨", "user", content);
      const localMessage = buildLocalMessage("张阿姨", "user", content);
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
        senderName: profile.display_name,
        senderRole: profile.role,
      }),
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      message?: ChatMessage;
      messageText?: string;
    };

    if (!response.ok || !payload.ok || !payload.message) {
      showToast("群消息写入失败，已回退到本地演示。", "warning");
      pushGroupMessage("张阿姨", "user", content);
      const localMessage = buildLocalMessage("张阿姨", "user", content);
      setMessages((current) => [...current, localMessage]);
      return localMessage;
    }

    setMessages((current) => [...current, payload.message as ChatMessage]);
    return payload.message as ChatMessage;
  }

  function appendAssistantReply(content: string, riskLevel?: RiskLevel) {
    const assistantMessage = buildLocalMessage("Claw 群助手", "assistant", content, riskLevel);
    setMessages((current) => [...current, assistantMessage]);

    if (!isSupabaseMode) {
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
            nextStep: "看完后可以顺手完成今天的小课积分。",
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
    appendAssistantReply("已完成今日小组打卡。", "low");
    showToast("已完成今日小组打卡，+5 分", "success");
  }

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-[18rem]">
        <header className="sticky top-0 z-20 -mx-4 border-b border-line/70 bg-[#F7E8D4]/95 px-5 pb-3 pt-8 text-center backdrop-blur-sm">
          <Link
            href="/"
            className="absolute left-5 top-8 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-cream text-navy shadow-soft"
            aria-label="回到首页"
          >
            <House className="h-5 w-5" strokeWidth={2.1} />
          </Link>
          <h1 className="px-14 text-[1.45rem] font-semibold text-navy">高血压互助小组</h1>
          <p className="mt-2 text-sm leading-6 text-navy/62">
            家医团队在群｜组长：王阿姨｜今日 12 人已打卡
          </p>
        </header>

        <SectionCard>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-[22px] bg-[#FFF8ED] px-3 py-4">
              <p className="text-xs tracking-[0.14em] text-navy/55">家医团队在群</p>
              <p className="mt-2 text-sm font-semibold text-navy">随时分流提醒</p>
            </div>
            <div className="rounded-[22px] bg-[#FFF8ED] px-3 py-4">
              <p className="text-xs tracking-[0.14em] text-navy/55">组长</p>
              <p className="mt-2 text-sm font-semibold text-navy">王阿姨</p>
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

        <p className="px-1 text-xs text-navy/52">
          {isSupabaseMode
            ? "当前群消息优先从 Supabase 读取，居民发言会优先写入数据库。"
            : "当前仍保留本地演示群消息，数据库未命中时会自动回退。"}
        </p>
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
              onClick={() => showToast("原型演示：这里会进入按住说话", "info")}
              className="flex min-h-[46px] items-center justify-center gap-1 rounded-full border border-line bg-cream px-3 py-2 text-sm font-semibold text-navy"
            >
              <Mic className="h-4 w-4" />
              <span className="hidden sm:inline">按住说话</span>
              <span className="sm:hidden">说话</span>
            </button>
            <button
              type="button"
              onClick={() => showToast("原型演示：这里会进入图片发送", "info")}
              className="flex min-h-[46px] items-center justify-center gap-1 rounded-full border border-line bg-cream px-3 py-2 text-sm font-semibold text-navy"
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

          <div className="flex items-center gap-2 rounded-[22px] border border-line bg-cream px-3 py-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void submitMessage(input);
                }
              }}
              placeholder="和小组说一句，或者问一个常见问题"
              className="h-11 flex-1 border-0 bg-transparent text-sm text-navy outline-none"
            />
            <button
              type="button"
              onClick={() => void submitMessage(input)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-white"
            >
              <Send className="h-4 w-4" />
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

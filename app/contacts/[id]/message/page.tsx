"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Send } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { ChatBubble } from "@/components/ChatBubble";
import { EmptyState } from "@/components/EmptyState";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { TypingBubble } from "@/components/TypingBubble";
import { contacts } from "@/data/contacts";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/supabase/mvp";
import { ChatMessage, ContactItem } from "@/lib/types";
import { useClawState } from "@/lib/useClawState";
import { useDemoUser } from "@/lib/useDemoUser";

function getDirectRole(contactId: string) {
  if (contactId.includes("doctor")) {
    return "doctor" as const;
  }

  if (contactId.includes("nurse")) {
    return "nurse" as const;
  }

  if (contactId === "daughter" || contactId === "son") {
    return "family" as const;
  }

  return "leader" as const;
}

function buildDirectReply(name: string, role: string, content: string) {
  if (role.includes("医生")) {
    return `${name}已经收到。您提到的是“${content}”，我建议先把最近一次配药、体检或不适情况整理一下，我会尽快回复您。`;
  }

  if (role.includes("护士")) {
    return `${name}看到啦，我先帮您记下这个情况。如果涉及随访或体检安排，我可以继续帮您确认时间。`;
  }

  if (role.includes("药师")) {
    return `${name}收到啦。药盒、处方流程或配药问题都可以继续发给我，我先帮您梳理下一步。`;
  }

  if (role.includes("家属")) {
    return `${name}收到消息了，晚些我帮您看看，也可以陪您一起联系家医团队。`;
  }

  return `${name}已经看到，后面我会帮您留意这件事，也可以帮您转告给家医团队。`;
}

export default function ContactMessagePage() {
  const params = useParams<{ id: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isRemoteMode, setIsRemoteMode] = useState(false);
  const [canSendRemote, setCanSendRemote] = useState(false);
  const [remoteThread, setRemoteThread] = useState<ChatMessage[]>([]);
  const [contact, setContact] = useState<ContactItem | null>(() =>
    contacts.find((item) => item.id === params.id) ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const handledInitial = useRef(false);
  const timeoutRef = useRef<number[]>([]);
  const { state, pushDirectMessage } = useClawState();
  const { currentUser } = useDemoUser();

  const thread = useMemo(() => {
    if (!contact) {
      return [];
    }

    return isRemoteMode ? remoteThread : (state.directMessages[contact.id] ?? []);
  }, [contact, isRemoteMode, remoteThread, state.directMessages]);

  const loadRemoteMessages = useCallback(async (contactId: string) => {
    const response = await fetch(`/api/contacts/${contactId}/messages`, {
      method: "GET",
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as {
      messages?: ChatMessage[];
      canSend?: boolean;
      message?: string;
    };

    if (!response.ok) {
      setRemoteThread([]);
      setCanSendRemote(false);
      setRemoteError(payload.message ?? "留言记录暂时还没同步成功，请稍后再试。");
      return;
    }

    setRemoteThread(payload.messages ?? []);
    setCanSendRemote(Boolean(payload.canSend));
    setRemoteError(null);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadContact() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      try {
        const profile = await fetchCurrentProfile(supabase);

        if (!active) {
          return;
        }

        if (!profile) {
          setIsRemoteMode(false);
          setLoading(false);
          return;
        }

        setIsRemoteMode(true);

        const response = await fetch(`/api/contacts/${params.id}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          contact?: ContactItem | null;
        };

        if (!active) {
          return;
        }

        if (!response.ok) {
          setContact(null);
          setRemoteError("联系人暂时还没同步成功，请稍后刷新再试。");
          return;
        }

        setContact(payload.contact ?? null);
        await loadRemoteMessages(params.id);
      } catch {
        if (active) {
          setIsRemoteMode(true);
          setCanSendRemote(false);
          setRemoteThread([]);
          setContact(null);
          setRemoteError("当前账号的留言记录暂时还没同步成功，请稍后刷新再试。");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadContact();

    return () => {
      active = false;
    };
  }, [loadRemoteMessages, params.id, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, isThinking]);

  useEffect(
    () => () => {
      timeoutRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  useEffect(() => {
    if (isRemoteMode || !contact || handledInitial.current || thread.length > 0) {
      return;
    }

    handledInitial.current = true;
    pushDirectMessage(
      contact.id,
      contact.name,
      getDirectRole(contact.id),
      `您好，我是${contact.name}。您可以直接告诉我想咨询的事情，我会尽快回复。`,
    );
  }, [contact, isRemoteMode, pushDirectMessage, thread.length]);

  const sendMessage = useCallback(async () => {
    if (!contact) {
      return;
    }

    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    if (isRemoteMode) {
      if (!canSendRemote) {
        return;
      }

      setIsThinking(true);

      try {
        const response = await fetch(`/api/contacts/${contact.id}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: trimmed }),
        });

        const payload = (await response.json().catch(() => ({}))) as {
          message?: ChatMessage;
          messageText?: string;
        };

        if (!response.ok) {
          setRemoteError(payload.messageText ?? "留言暂时没有同步成功，请稍后再试。");
          return;
        }

        if (payload.message) {
          setRemoteThread((current) => [...current, payload.message as ChatMessage]);
        } else {
          await loadRemoteMessages(contact.id);
        }

        setRemoteError(null);
        setInput("");
      } finally {
        setIsThinking(false);
      }

      return;
    }

    pushDirectMessage(contact.id, currentUser?.name ?? "当前用户", "user", trimmed);
    setInput("");
    setIsThinking(true);

    const timer = window.setTimeout(() => {
      pushDirectMessage(
        contact.id,
        contact.name,
        getDirectRole(contact.id),
        buildDirectReply(contact.name, contact.role, trimmed),
      );
      setIsThinking(false);
    }, 800 + Math.floor(Math.random() * 401));

    timeoutRef.current.push(timer);
  }, [canSendRemote, contact, currentUser?.name, input, isRemoteMode, loadRemoteMessages, pushDirectMessage]);

  if (loading) {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="消息" subtitle="正在读取联系人信息..." />
        </div>
      </PhoneShell>
    );
  }

  if (!contact) {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="联系人未找到" subtitle="请返回上一页重新选择联系人。" />
          <SectionCard>
            <EmptyState title="当前没有这个联系人" description="请返回上一页重新选择联系人。" />
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-40">
        <BackHeader title={`和 ${contact.name} 发消息`} subtitle={contact.role} />

        {remoteError ? (
          <SectionCard>
            <div className="rounded-[22px] border border-amber/25 bg-[#FFF6EA] px-4 py-4">
              <p className="text-sm font-semibold text-navy">数据同步稍有延迟</p>
              <p className="mt-1 text-sm leading-6 text-navy/66">{remoteError}</p>
            </div>
          </SectionCard>
        ) : null}

        <section className="rounded-[26px] border border-line/80 bg-surface-card px-4 py-4 shadow-soft">
          <div className="flex items-center gap-3">
            <div className="relative h-16 w-16 overflow-hidden rounded-full border border-white/60 bg-surface-avatar shadow-soft">
              {contact.avatarPath ? (
                <Image src={contact.avatarPath} alt={contact.name} fill sizes="64px" className="object-cover" />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-lg font-semibold text-white"
                  style={{ backgroundColor: contact.avatarColor }}
                >
                  {contact.name.slice(0, 1)}
                </div>
              )}
            </div>
            <div>
              <p className="text-base font-semibold text-navy">{contact.name}</p>
              <p className="mt-1 text-sm text-sage">{contact.role}</p>
              <p className="mt-2 text-xs leading-5 text-navy/58">{contact.description}</p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          {thread.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
          {isThinking ? <TypingBubble author={contact.name} /> : null}
          <div ref={bottomRef} />
        </section>

        <p className="rounded-[20px] bg-surface-card px-4 py-3 text-xs leading-5 text-navy/58">
          {isRemoteMode
            ? canSendRemote
              ? "当前留言会同步到账号通知记录，并提醒对方尽快查看。"
              : "当前联系人暂未开通在线留言，您仍可查看联系人资料，并通过电话或联系请求沟通。"
            : "这里会先保留当前设备上的会话记录，方便您继续体验沟通流程。"}
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-line/70 bg-surface-nav/96 px-4 pb-6 pt-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 rounded-[22px] border border-line bg-cream px-3 py-1.5">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (!isRemoteMode || canSendRemote)) {
                void sendMessage();
              }
            }}
            placeholder={
              isRemoteMode && !canSendRemote
                ? "该联系人暂未开通在线留言"
                : `给 ${contact.name} 发一句消息`
            }
            disabled={isRemoteMode && !canSendRemote}
            className="h-12 flex-1 border-0 bg-transparent text-[15px] text-navy outline-none placeholder:text-navy/40"
          />
          <button
            type="button"
            onClick={() => {
              void sendMessage();
            }}
            disabled={isRemoteMode && !canSendRemote}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-white active:scale-95 disabled:opacity-40"
          >
            <Send className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </PhoneShell>
  );
}

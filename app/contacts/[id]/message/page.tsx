"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Send } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { ChatBubble } from "@/components/ChatBubble";
import { PhoneShell } from "@/components/PhoneShell";
import { TypingBubble } from "@/components/TypingBubble";
import { contacts } from "@/data/contacts";
import { useClawState } from "@/lib/useClawState";

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
  if (role.includes("家庭医生")) {
    return `${name}已收到。您提到的是“${content}”，我建议先把最近一次配药、体检或不适情况整理一下，我会尽快回复您。`;
  }

  if (role.includes("护士")) {
    return `${name}看到了，我先帮您记下这个情况。若涉及随访或体检安排，我可以继续帮您确认时间。`;
  }

  if (role.includes("药师")) {
    return `${name}收到。药盒、处方流程或配药问题可以继续发给我，我会先帮您梳理下一步。`;
  }

  if (role.includes("家属")) {
    return `${name}收到消息了，晚些我帮您看看，也可以陪您一起联系家医团队。`;
  }

  return `${name}已经看到，后面我会帮您留意这件事，也可以帮您转告给家医团队。`;
}

export default function ContactMessagePage() {
  const params = useParams<{ id: string }>();
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const handledInitial = useRef(false);
  const timeoutRef = useRef<number[]>([]);
  const { state, pushDirectMessage } = useClawState();
  const contact = contacts.find((item) => item.id === params.id);

  const thread = useMemo(
    () => (contact ? state.directMessages[contact.id] ?? [] : []),
    [contact, state.directMessages],
  );

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
    if (!contact || handledInitial.current || thread.length > 0) {
      return;
    }

    handledInitial.current = true;
    pushDirectMessage(
      contact.id,
      contact.name,
      getDirectRole(contact.id),
      `您好，我是${contact.name}。您可以直接告诉我想咨询的事情，我会尽快回复。`,
    );
  }, [contact, pushDirectMessage, thread.length]);

  if (!contact) {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="联系人未找到" subtitle="请返回上一页重新选择联系人" />
        </div>
      </PhoneShell>
    );
  }

  function sendMessage() {
    if (!contact) {
      return;
    }

    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    pushDirectMessage(contact.id, "张阿姨", "user", trimmed);
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
  }

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-40">
        <BackHeader title={`和${contact.name}发消息`} subtitle={contact.role} />

        <section className="rounded-[26px] border border-line/80 bg-[#FFF8ED] px-4 py-4 shadow-soft">
          <div className="flex items-center gap-3">
            <div className="relative h-16 w-16 overflow-hidden rounded-full border border-white/60 bg-[#F6E9D7] shadow-soft">
              {contact.avatarPath ? (
                <Image
                  src={contact.avatarPath}
                  alt={contact.name}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : null}
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
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-line/70 bg-[#F7E8D4]/96 px-4 pb-6 pt-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 rounded-[22px] border border-line bg-cream px-3 py-1.5">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                sendMessage();
              }
            }}
            placeholder={`给${contact.name}发一句消息`}
            className="h-12 flex-1 border-0 bg-transparent text-[15px] text-navy outline-none placeholder:text-navy/40"
          />
          <button
            type="button"
            onClick={sendMessage}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-white active:scale-95"
          >
            <Send className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </PhoneShell>
  );
}

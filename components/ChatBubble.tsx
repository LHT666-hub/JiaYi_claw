"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Mic } from "lucide-react";
import { formatMessageTime } from "@/lib/format";
import { ChatMessage } from "@/lib/types";

const roleStyleMap = {
  user: "ml-auto max-w-[82%] bg-navy text-white",
  assistant: "mr-auto max-w-[88%] bg-[#FFF8ED] text-navy border border-line/70",
  doctor: "mr-auto max-w-[88%] bg-[#EEF5F3] text-navy border border-sage/25",
  nurse: "mr-auto max-w-[88%] bg-[#F5F1E6] text-navy border border-line/70",
  leader: "mr-auto max-w-[88%] bg-[#F7F2FF] text-navy border border-[#D5CCE9]",
  family: "mr-auto max-w-[88%] bg-[#FDEEE7] text-navy border border-[#E4C7B8]",
} as const;

const riskLabelMap = {
  medium: "建议再确认",
  high: "建议联系家医",
  emergency: "紧急就医提示",
} as const;

type ChatBubbleProps = {
  message: ChatMessage;
  onSummaryRequest?: () => void;
};

function parseVoiceMessage(content: string) {
  const match = content.match(/^\[\[voice:(\d+)\]\]$/);

  if (!match) {
    return null;
  }

  return {
    durationSeconds: Number(match[1]),
  };
}

export function ChatBubble({ message, onSummaryRequest }: ChatBubbleProps) {
  const router = useRouter();
  const isUser = message.role === "user";
  const time = formatMessageTime(message.createdAt);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);

  const isSafety = message.source === "safety";
  const isHighRisk = message.riskLevel === "high" || message.riskLevel === "emergency";
  const showActionButtons = !isUser && (isHighRisk || isSafety);
  const riskLabel =
    message.riskLevel && message.riskLevel !== "low"
      ? riskLabelMap[message.riskLevel as keyof typeof riskLabelMap]
      : null;

  const bubbleStyle = isSafety
    ? "mr-auto max-w-[88%] bg-[#FBF0ED] text-navy border border-danger/20"
    : roleStyleMap[message.role];
  const voiceMessage = useMemo(() => parseVoiceMessage(message.content), [message.content]);

  useEffect(() => {
    if (!isPlayingVoice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsPlayingVoice(false);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [isPlayingVoice]);

  return (
    <div className={isUser ? "ml-auto max-w-[82%]" : "mr-auto max-w-[88%]"}>
      {!isUser ? (
        <p className="mb-1.5 text-xs font-semibold text-navy/55">{message.author}</p>
      ) : null}
      <div className={`rounded-[22px] px-4 py-3 shadow-soft ${bubbleStyle}`}>
        {voiceMessage ? (
          <button
            type="button"
            onClick={() => setIsPlayingVoice((current) => !current)}
            className="flex items-center gap-3 text-left"
          >
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                isUser ? "bg-white/12" : "bg-navy/8"
              }`}
            >
              <Mic className={`h-4 w-4 ${isPlayingVoice ? "animate-pulse" : ""}`} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{voiceMessage.durationSeconds}''</span>
              <span className={`text-xs ${isUser ? "text-white/70" : "text-navy/45"}`}>
                {isPlayingVoice ? "播放中" : "点击播放"}
              </span>
            </div>
          </button>
        ) : (
          <p className="text-sm leading-7">{message.content}</p>
        )}
      </div>

      {!isUser && riskLabel ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
              isHighRisk
                ? "border-danger/20 bg-[#F8DDD9] text-danger"
                : "border-amber/20 bg-[#FFF1DD] text-amber"
            }`}
          >
            {riskLabel}
          </span>
        </div>
      ) : null}

      {showActionButtons ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push("/contacts/li-doctor")}
            className="rounded-full border border-danger/20 bg-[#FBF0ED] px-3 py-1.5 text-xs font-semibold text-danger active:scale-95"
          >
            联系李医生
          </button>
          {onSummaryRequest ? (
            <button
              type="button"
              onClick={onSummaryRequest}
              className="rounded-full border border-sage/30 bg-[#EEF5F3] px-3 py-1.5 text-xs font-semibold text-sage active:scale-95"
            >
              让 Claw 帮我说明情况
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.push("/contacts")}
            className="rounded-full border border-line bg-cream px-3 py-1.5 text-xs font-semibold text-navy active:scale-95"
          >
            查看一键找人
          </button>
        </div>
      ) : null}

      <p className={`mt-1.5 text-[11px] text-navy/40 ${isUser ? "text-right" : "text-left"}`}>
        {time}
      </p>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
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

const sourceLabelMap: Record<string, { label: string; style: string }> = {
  safety: { label: "安全提示", style: "bg-[#F8DDD9] text-danger border-danger/20" },
  faq: { label: "FAQ 回答", style: "bg-[#E8F0EE] text-sage border-sage/20" },
  knowledge_kimi: { label: "知识库生成", style: "bg-[#EDE8F5] text-[#5B4A8A] border-[#D5CCE9]" },
  kimi: { label: "Kimi 生成", style: "bg-[#EDE8F5] text-[#5B4A8A] border-[#D5CCE9]" },
  fallback: { label: "兜底提示", style: "bg-[#F3E4CD] text-navy/68 border-line/40" },
  greeting: { label: "FAQ 回答", style: "bg-[#E8F0EE] text-sage border-sage/20" },
  knowledge: { label: "知识库生成", style: "bg-[#EDE8F5] text-[#5B4A8A] border-[#D5CCE9]" },
};

type ChatBubbleProps = {
  message: ChatMessage;
};

export function ChatBubble({ message }: ChatBubbleProps) {
  const router = useRouter();
  const isUser = message.role === "user";
  const time = formatMessageTime(message.createdAt);
  const sourceInfo = message.source ? sourceLabelMap[message.source] : null;

  const isSafety = message.source === "safety";
  const isHighRisk = message.riskLevel === "high" || message.riskLevel === "emergency";
  const showActionButtons = !isUser && (isHighRisk || isSafety);

  const bubbleStyle = isSafety
    ? "mr-auto max-w-[88%] bg-[#FBF0ED] text-navy border border-danger/20"
    : roleStyleMap[message.role];

  return (
    <div className={isUser ? "ml-auto max-w-[82%]" : "mr-auto max-w-[88%]"}>
      {!isUser ? (
        <p className="mb-1.5 text-xs font-semibold text-navy/55">{message.author}</p>
      ) : null}
      <div className={`rounded-[22px] px-4 py-3 shadow-soft ${bubbleStyle}`}>
        <p className="text-sm leading-7">{message.content}</p>
      </div>

      {!isUser && sourceInfo ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${sourceInfo.style}`}>
            {sourceInfo.label}
          </span>
          {message.riskLevel && message.riskLevel !== "low" ? (
            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
              isHighRisk
                ? "border-danger/20 bg-[#F8DDD9] text-danger"
                : "border-amber/20 bg-[#FFF1DD] text-amber"
            }`}>
              风险：{message.riskLevel === "emergency" ? "紧急" : message.riskLevel === "high" ? "高" : "中"}
            </span>
          ) : null}
        </div>
      ) : null}

      {showActionButtons ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push("/contacts/li-doctor")}
            className="rounded-full border border-danger/20 bg-[#FBF0ED] px-3 py-1.5 text-xs font-semibold text-danger"
          >
            联系李医生
          </button>
          <button
            type="button"
            onClick={() => router.push("/contacts")}
            className="rounded-full border border-line bg-cream px-3 py-1.5 text-xs font-semibold text-navy"
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

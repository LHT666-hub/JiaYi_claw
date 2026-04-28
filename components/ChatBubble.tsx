import { ChatMessage } from "@/lib/types";
import { formatMessageTime } from "@/lib/format";

const roleStyleMap = {
  user: "ml-auto max-w-[82%] bg-navy text-white",
  assistant: "mr-auto max-w-[88%] bg-[#FFF8ED] text-navy border border-line/70",
  doctor: "mr-auto max-w-[88%] bg-[#EEF5F3] text-navy border border-sage/25",
  nurse: "mr-auto max-w-[88%] bg-[#F5F1E6] text-navy border border-line/70",
  leader: "mr-auto max-w-[88%] bg-[#F7F2FF] text-navy border border-[#D5CCE9]",
  family: "mr-auto max-w-[88%] bg-[#FDEEE7] text-navy border border-[#E4C7B8]",
};

const sourceLabelMap = {
  safety: "安全提示",
  faq: "FAQ 回答",
  kimi: "Kimi 生成",
  fallback: "兜底提示",
};

type ChatBubbleProps = {
  message: ChatMessage;
};

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const time = formatMessageTime(message.createdAt);
  const sourceLabel = message.source ? sourceLabelMap[message.source] : null;
  const showReason = message.source === "fallback" && !!message.reason;

  return (
    <div className={isUser ? "ml-auto max-w-[82%]" : "mr-auto max-w-[88%]"}>
      {!isUser ? (
        <p className="mb-1 text-xs font-semibold text-navy/55">{message.author}</p>
      ) : null}
      <div className={`rounded-[22px] px-4 py-3 shadow-soft ${roleStyleMap[message.role]}`}>
        <p className="text-sm leading-6">{message.content}</p>
      </div>
      {!isUser && sourceLabel ? (
        <div className="mt-1">
          <span className="inline-flex rounded-full bg-[#E9DDCB] px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-navy/65">
            {sourceLabel}
          </span>
          {showReason ? (
            <span className="ml-1 inline-flex rounded-full bg-[#F3E7D6] px-2.5 py-1 text-[10px] font-semibold tracking-[0.04em] text-navy/60">
              reason: {message.reason}
            </span>
          ) : null}
        </div>
      ) : null}
      <p className={`mt-1 text-[11px] text-navy/40 ${isUser ? "text-right" : "text-left"}`}>
        {time}
      </p>
    </div>
  );
}

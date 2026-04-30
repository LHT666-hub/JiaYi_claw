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

const sourceLabelMap = {
  safety: "安全提示",
  faq: "FAQ 回答",
  knowledge_kimi: "知识库生成",
  kimi: "Kimi 生成",
  fallback: "兜底提示",
  greeting: "FAQ 回答",
  knowledge: "知识库生成",
} as const;

type ChatBubbleProps = {
  message: ChatMessage;
};

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const time = formatMessageTime(message.createdAt);
  const sourceLabel = message.source ? sourceLabelMap[message.source] : null;

  return (
    <div className={isUser ? "ml-auto max-w-[82%]" : "mr-auto max-w-[88%]"}>
      {!isUser ? (
        <p className="mb-1 text-xs font-semibold text-navy/55">{message.author}</p>
      ) : null}
      <div className={`rounded-[22px] px-4 py-3 shadow-soft ${roleStyleMap[message.role]}`}>
        <p className="text-sm leading-6">{message.content}</p>
      </div>
      {!isUser && sourceLabel ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full bg-[#F3E4CD] px-3 py-1 text-[11px] font-semibold text-navy/68">
            {sourceLabel}
          </span>
          {message.reason ? (
            <span className="rounded-full bg-[#F5ECDD] px-3 py-1 text-[11px] text-navy/52">
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

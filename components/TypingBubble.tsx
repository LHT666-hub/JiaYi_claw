export function TypingBubble({ author = "家医 Claw" }: { author?: string }) {
  return (
    <div className="mr-auto max-w-[88%]">
      <p className="mb-1 text-xs font-semibold text-navy/55">{author}</p>
      <div className="inline-flex items-center gap-1 rounded-[20px] border border-line/70 bg-[#FFF8ED] px-4 py-3 shadow-soft">
        <span className="typing-dot bg-navy/40" />
        <span className="typing-dot typing-dot-delay-1 bg-navy/55" />
        <span className="typing-dot typing-dot-delay-2 bg-navy/70" />
      </div>
      <p className="mt-1 text-[11px] text-navy/40">正在整理回复…</p>
    </div>
  );
}

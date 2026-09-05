import { Camera, Keyboard, Mic } from "lucide-react";

type PrimaryClawCardProps = {
  onVoice: () => void;
  onPhoto: () => void;
  onText: () => void;
  onQuickQuestion: (question: string) => void;
};

const quickQuestions = ["药吃完了怎么办", "体检报告怎么看", "今天谁在坐班"];

export function PrimaryClawCard({
  onVoice,
  onPhoto,
  onText,
  onQuickQuestion,
}: PrimaryClawCardProps) {
  return (
    <section className="relative overflow-hidden rounded-[32px] border border-navySoft bg-navy px-5 py-5 text-white shadow-[0_22px_48px_rgba(16,42,67,0.22)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-brand text-[26px] font-bold">
            问 Claw
          </p>
        </div>
        <div className="rounded-full border border-white/22 bg-white/12 px-3 py-1 text-xs font-semibold text-white/82 backdrop-blur-sm">
          AI
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <button
          type="button"
          data-haptic="medium"
          data-press="card"
          onClick={onVoice}
          className="group flex items-center justify-between rounded-[26px] border border-white/60 bg-white/[0.94] px-4 py-4 text-left text-navy shadow-[0_14px_34px_rgba(16,42,67,0.12)] backdrop-blur-sm transition hover:-translate-y-0.5"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-tint text-navy transition group-hover:scale-105">
              <Mic className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-bold">语音问 Claw</p>
            </div>
          </div>
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            data-haptic="light"
            data-press="card"
            onClick={onPhoto}
            className="flex items-center gap-3 rounded-[22px] border border-white/20 bg-white/12 px-4 py-4 text-left backdrop-blur-sm transition hover:bg-white/18"
          >
            <Camera className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">拍照问</p>
              <p className="mt-1 text-xs text-white/68">药盒、体检单</p>
            </div>
          </button>
          <button
            type="button"
            data-haptic="light"
            data-press="card"
            onClick={onText}
            className="flex items-center gap-3 rounded-[22px] border border-white/20 bg-white/12 px-4 py-4 text-left backdrop-blur-sm transition hover:bg-white/18"
          >
            <Keyboard className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">打字问</p>
            </div>
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {quickQuestions.map((question) => (
          <button
            key={question}
            type="button"
            data-haptic="selection"
            onClick={() => onQuickQuestion(question)}
            className="rounded-full border border-white/18 bg-white/10 px-3 py-2 text-sm text-white/88 transition hover:bg-white/16"
          >
            {question}
          </button>
        ))}
      </div>
    </section>
  );
}

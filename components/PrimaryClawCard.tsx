import { Camera, Keyboard, Mic } from "lucide-react";

type PrimaryClawCardProps = {
  onVoice: () => void;
  onPhoto: () => void;
  onText: () => void;
  onQuickQuestion: (question: string) => void;
};

const quickQuestions = ["药吃完了怎么办", "体检报告怎么看", "我要找李医生"];

export function PrimaryClawCard({
  onVoice,
  onPhoto,
  onText,
  onQuickQuestion,
}: PrimaryClawCardProps) {
  return (
    <section className="rounded-[30px] bg-gradient-to-br from-navy to-navySoft px-5 py-5 text-white shadow-float">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-brand text-[1.55rem] font-semibold">有问题先问 Claw</p>
          <p className="mt-2 text-sm leading-6 text-white/78">
            配药、体检、随访、找医生，先帮您分清下一步。
          </p>
        </div>
        <div className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/78">
          今日主入口
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <button
          type="button"
          onClick={onVoice}
          className="flex items-center justify-between rounded-[24px] bg-white px-4 py-4 text-left text-navy shadow-soft transition hover:-translate-y-0.5"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E7EEF6]">
              <Mic className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-semibold">语音问</p>
              <p className="text-xs text-navy/58">适合一句话直接问</p>
            </div>
          </div>
          <span className="text-xs font-semibold tracking-[0.14em] text-navy/45">推荐</span>
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onPhoto}
            className="flex items-center gap-3 rounded-[22px] border border-white/20 bg-white/10 px-4 py-4 text-left transition hover:bg-white/15"
          >
            <Camera className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">拍照问</p>
              <p className="mt-1 text-xs text-white/68">药盒、体检单</p>
            </div>
          </button>
          <button
            type="button"
            onClick={onText}
            className="flex items-center gap-3 rounded-[22px] border border-white/20 bg-white/10 px-4 py-4 text-left transition hover:bg-white/15"
          >
            <Keyboard className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">打字问</p>
              <p className="mt-1 text-xs text-white/68">慢慢写也可以</p>
            </div>
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {quickQuestions.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onQuickQuestion(question)}
            className="rounded-full border border-white/20 bg-white/8 px-3 py-2 text-sm transition hover:bg-white/14"
          >
            {question}
          </button>
        ))}
      </div>
    </section>
  );
}

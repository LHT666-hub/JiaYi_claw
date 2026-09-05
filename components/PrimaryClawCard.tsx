import { Camera, Keyboard, Mic } from "lucide-react";

type PrimaryClawCardProps = {
  onVoice: () => void;
  onPhoto: () => void;
  onText: () => void;
  onQuickQuestion: (question: string) => void;
};

export function PrimaryClawCard({
  onVoice,
  onPhoto,
  onText,
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
            onClick={onPhoto}
            className="group flex items-center gap-3 rounded-[22px] border border-white/90 bg-white px-4 py-4 text-left text-navy shadow-[0_14px_30px_rgba(16,42,67,0.20),inset_0_1px_0_rgba(255,255,255,0.96)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(16,42,67,0.24),inset_0_1px_0_rgba(255,255,255,0.98)] active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F3E7D9] text-navy shadow-[0_4px_10px_rgba(16,42,67,0.08),inset_0_1px_0_rgba(255,255,255,0.75)] transition group-hover:scale-105">
              <Camera className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold">拍照问</p>
              <p className="mt-1 text-xs text-navy/55">药盒、体检单</p>
            </div>
          </button>
          <button
            type="button"
            onClick={onText}
            className="group flex items-center gap-3 rounded-[22px] border border-white/75 bg-white px-4 py-4 text-left text-navy shadow-[0_7px_16px_rgba(16,42,67,0.11),inset_0_1px_0_rgba(255,255,255,0.94)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(16,42,67,0.15),inset_0_1px_0_rgba(255,255,255,0.96)] active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-tint text-sage shadow-[0_2px_8px_rgba(16,42,67,0.06),inset_0_1px_0_rgba(255,255,255,0.72)] transition group-hover:scale-105">
              <Keyboard className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">打字问</p>
            </div>
          </button>
        </div>
      </div>
    </section>
  );
}

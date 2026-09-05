import { Camera, Keyboard, Mic } from "lucide-react";

type PrimaryClawCardProps = {
  onVoice: () => void;
  onPhoto: () => void;
  onText: () => void;
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
          <p className="font-brand text-[1.62rem] font-semibold tracking-[-0.03em]">
            问 Claw
          </p>
          <p className="mt-2 text-sm leading-6 text-white/78">
            健康问题先问问，家医分流更省心。
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
              <p className="text-base font-bold">去咨询</p>
              <p className="text-xs text-navy/58">适合一句话直接问</p>
            </div>
          </div>
          <span className="rounded-full bg-surface-chip px-2.5 py-1 text-[11px] font-semibold text-navy/55">
            推荐
          </span>
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onPhoto}
            className="group flex items-center gap-3 rounded-[22px] border border-white/45 bg-risk-soft px-4 py-4 text-left text-navy shadow-[0_10px_24px_rgba(16,42,67,0.16)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(16,42,67,0.20)] active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-amber shadow-[0_4px_12px_rgba(16,42,67,0.08)] transition group-hover:scale-105">
              <Camera className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">拍照问</p>
              <p className="mt-1 text-xs text-navy/58">药盒、体检单</p>
            </div>
          </button>
          <button
            type="button"
            onClick={onText}
            className="group flex items-center gap-3 rounded-[22px] border border-white/35 bg-health-muted px-4 py-4 text-left text-navy shadow-[0_7px_18px_rgba(16,42,67,0.11)] transition hover:-translate-y-0.5 hover:shadow-[0_11px_22px_rgba(16,42,67,0.15)] active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/65 text-sage shadow-[0_3px_10px_rgba(16,42,67,0.06)] transition group-hover:scale-105">
              <Keyboard className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">打字问</p>
              <p className="mt-1 text-xs text-navy/55">慢慢写也可以</p>
            </div>
          </button>
        </div>
      </div>
    </section>
  );
}

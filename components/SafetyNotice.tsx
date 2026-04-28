import { AlertTriangle } from "lucide-react";

type SafetyNoticeProps = {
  children: React.ReactNode;
  tone?: "default" | "danger";
};

export function SafetyNotice({ children, tone = "default" }: SafetyNoticeProps) {
  const toneClass =
    tone === "danger"
      ? "border-danger/25 bg-[#FDEFEA] text-danger"
      : "border-line/70 bg-[#FFF7EC] text-navy";

  return (
    <div className={`rounded-3xl border px-4 py-3 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.1} />
        <p className="text-sm leading-6">{children}</p>
      </div>
    </div>
  );
}

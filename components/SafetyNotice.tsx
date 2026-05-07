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

  const iconClass =
    tone === "danger" ? "text-danger" : "text-amber";

  return (
    <div className={`rounded-3xl border px-4 py-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tone === "danger" ? "bg-danger/10" : "bg-amber/10"}`}>
          <AlertTriangle className={`h-3.5 w-3.5 ${iconClass}`} strokeWidth={2.2} />
        </div>
        <p className="text-sm leading-6">{children}</p>
      </div>
    </div>
  );
}

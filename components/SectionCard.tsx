type SectionCardProps = {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function SectionCard({ title, action, children, className = "" }: SectionCardProps) {
  return (
    <section
      className={`rounded-[28px] border border-line/80 bg-cream px-4 py-4 shadow-soft ${className}`}
    >
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-navy">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

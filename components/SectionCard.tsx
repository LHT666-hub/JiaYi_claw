type SectionCardProps = {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function SectionCard({ title, subtitle, action, children, className = "" }: SectionCardProps) {
  return (
    <section
      className={`resident-section py-2 ${className}`}
    >
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><h2 className="text-[18px] font-bold text-navy">{title}</h2>{subtitle ? <p className="mt-1 text-xs leading-5 text-navy/48">{subtitle}</p> : null}</div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

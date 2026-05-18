type SectionCardProps = {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function SectionCard({ title, action, children, className = "" }: SectionCardProps) {
  return (
    <section
      className={`ios-material rounded-[30px] px-4 py-4 ${className}`}
    >
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[1.08rem] font-bold tracking-[-0.01em] text-navy">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

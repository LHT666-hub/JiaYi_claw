type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-[18px] bg-line/40 ${className}`}
      aria-hidden
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-[28px] border border-line/60 bg-cream p-4 space-y-3">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-10 w-24 rounded-full" />
    </div>
  );
}

export function SkeletonMetric() {
  return (
    <div className="rounded-[22px] border border-line/50 bg-[#FFF8ED] px-4 py-4">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-3 h-7 w-12" />
    </div>
  );
}

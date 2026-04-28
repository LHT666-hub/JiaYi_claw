type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-[24px] border border-dashed border-line/80 bg-[#FFF8ED] px-4 py-6 text-center">
      <svg
        viewBox="0 0 160 100"
        className="mx-auto h-28 w-40 text-[#D8C2A3]"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M22 78h116"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <rect
          x="28"
          y="20"
          width="44"
          height="46"
          rx="14"
          fill="#FFF4E2"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <rect
          x="88"
          y="12"
          width="44"
          height="54"
          rx="14"
          fill="#F7E8D4"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <path
          d="M42 40h16M42 49h10"
          stroke="#102A43"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M102 34h16M102 43h14M102 52h9"
          stroke="#102A43"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="118" cy="70" r="10" fill="#E9F0EE" />
        <path
          d="M115 70l2 2 4-5"
          stroke="#6F9996"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="mt-4 text-sm font-semibold text-navy">{title}</p>
      <p className="mt-2 text-sm leading-6 text-navy/62">{description}</p>
    </div>
  );
}

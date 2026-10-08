/** Wordmark "Agilizou" com a seta dourada ascendente. */
export function Logo({ className = "", claro = false }: { className?: string; claro?: boolean }) {
  return (
    <span
      className={`inline-flex items-start text-2xl font-bold tracking-tight ${claro ? "text-white" : "text-royal"} ${className}`}
      aria-label="Agilizou"
    >
      Agilizou
      <svg viewBox="0 0 12 8" className="-ml-0.5 mt-0.5 h-2 w-3" aria-hidden="true">
        <path
          d="M1.5 6.5 L6 2 L10.5 6.5"
          fill="none"
          stroke="#C9A24B"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

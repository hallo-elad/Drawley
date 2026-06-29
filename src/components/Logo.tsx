/** Drawley brand mark — a stylised brush nib in the brand gradient. */
export function Logo({ size = 28 }: { size?: number }) {
  const id = 'drawley-logo-grad';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c6cff" />
          <stop offset="1" stopColor="#4dd4f7" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill={`url(#${id})`} />
      <path
        d="M20 44c-2 0-3-1-3-3 0-6 4-10 9-15l10-10c2-2 5-2 7 0s2 5 0 7L33 33c-5 5-9 9-13 11z"
        fill="#fff"
      />
      <circle cx="22" cy="42" r="3.2" fill="#2a2350" />
    </svg>
  );
}

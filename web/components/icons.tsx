// Small hand-drawn SVG icons used throughout the UI. Kept as inline
// components instead of pulling in an icon library, since `ethers` is the
// only extra dependency this project needs (see web/README.md).

type IconProps = { className?: string };

export function DepositIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="M12 4v11" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 11l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ThumbsUpIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path
        d="M7 10v10H4a1 1 0 01-1-1v-8a1 1 0 011-1h3zm0 0l4.5-7a2 2 0 013.6 1.5L14 9h5a2 2 0 012 2l-1.5 7a2 2 0 01-2 1.5H10a3 3 0 01-3-3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThumbsDownIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path
        d="M17 14V4h3a1 1 0 011 1v8a1 1 0 01-1 1h-3zm0 0l-4.5 7a2 2 0 01-3.6-1.5L10 15H5a2 2 0 01-2-2l1.5-7a2 2 0 012-1.5H14a3 3 0 013 3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MinusCircleIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" strokeLinecap="round" />
    </svg>
  );
}

export function PlayIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8 5.5v13l11-6.5-11-6.5z" />
    </svg>
  );
}

export function ChevronDownIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FastForwardIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4 5.5v13l9-6.5-9-6.5z" />
      <path d="M13 5.5v13l9-6.5-9-6.5z" />
    </svg>
  );
}

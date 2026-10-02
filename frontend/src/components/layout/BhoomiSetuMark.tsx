export function BhoomiSetuMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="30" height="30" rx="2" fill="#0B1F3A" />
      <path
        d="M8 22.5V13.8L16 8L24 13.8V22.5"
        stroke="#F7F5F0"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 22.5V16.5H20V22.5" stroke="#F7F5F0" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="16" cy="13" r="1.6" fill="#D4AF37" />
    </svg>
  );
}

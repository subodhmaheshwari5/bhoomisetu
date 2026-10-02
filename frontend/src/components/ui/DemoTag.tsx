export function DemoTag({ label = "Demo data" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-gold-500/40 bg-gold-50 px-2 py-0.5 font-mono text-[11px] tracking-wide text-gold-600">
      {label}
    </span>
  );
}

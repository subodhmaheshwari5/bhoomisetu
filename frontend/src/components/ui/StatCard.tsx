import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "default" | "danger" | "warning";
}

const TONE_ACCENT: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-navy-700",
  danger: "text-danger",
  warning: "text-warning",
};

export function StatCard({ label, value, icon: Icon, tone = "default" }: StatCardProps) {
  return (
    <div className="border border-hairline bg-white p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-ink-soft">{label}</p>
        <Icon className={`h-4 w-4 ${TONE_ACCENT[tone]}`} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="mt-3 font-mono text-3xl font-medium text-navy-950">{value}</p>
    </div>
  );
}

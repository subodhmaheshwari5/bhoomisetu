import type { TooltipContentProps } from "recharts";

/**
 * A single tooltip presentation reused across all dashboard charts, so
 * hovering any chart on the Overview page feels like the same product.
 */
export function ChartTooltip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="min-w-36 border border-hairline bg-white px-3 py-2 shadow-sm">
      {label !== undefined && (
        <p className="mb-1.5 text-xs font-medium text-navy-950">{label}</p>
      )}
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-ink-soft">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              {entry.name}
            </span>
            <span className="font-mono font-medium text-navy-950">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

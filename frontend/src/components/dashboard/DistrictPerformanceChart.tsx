import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { MapPinned } from "lucide-react";
import type { ApiDistrictPerformancePoint } from "../../types/api";
import { ChartTooltip } from "./ChartTooltip";

export function DistrictPerformanceChart({ data }: { data: ApiDistrictPerformancePoint[] }) {
  const busiest = data[0]?.cases ?? 0;

  return (
    <section className="border border-hairline bg-white" aria-labelledby="district-performance-heading">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h2 id="district-performance-heading" className="flex items-center gap-2 font-display text-lg text-navy-950">
          <MapPinned className="h-4 w-4 text-navy-700" strokeWidth={1.75} aria-hidden="true" />
          District Performance
        </h2>
        <span className="font-mono text-xs text-slate">{data.length} districts</span>
      </div>

      <div className="p-5">
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
              <XAxis
                dataKey="district"
                tick={{ fontSize: 12, fill: "var(--color-ink-soft)" }}
                axisLine={{ stroke: "var(--color-hairline)" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: "var(--color-ink-soft)" }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip cursor={{ fill: "var(--color-paper-dim)" }} content={<ChartTooltip />} />
              <Bar dataKey="cases" name="Cases" radius={[2, 2, 0, 0]} maxBarSize={56}>
                {data.map((entry) => (
                  <Cell
                    key={entry.district}
                    fill={entry.cases === busiest && busiest > 0 ? "var(--color-gold-500)" : "var(--color-navy-700)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

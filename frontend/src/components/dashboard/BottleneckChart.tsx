import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TrendingDown } from "lucide-react";
import type { ApiBottleneckPoint } from "../../types/api";
import { ChartTooltip } from "./ChartTooltip";

export function BottleneckChart({ data }: { data: ApiBottleneckPoint[] }) {
  const chartData = data.filter((d) => d.delayedCount > 0);
  const worst = Math.max(0, ...chartData.map((d) => d.delayedCount));

  return (
    <section className="border border-hairline bg-white" aria-labelledby="bottleneck-heading">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h2 id="bottleneck-heading" className="flex items-center gap-2 font-display text-lg text-navy-950">
          <TrendingDown className="h-4 w-4 text-navy-700" strokeWidth={1.75} aria-hidden="true" />
          Bottleneck Analytics — Delays by Stage
        </h2>
        <span className="font-mono text-xs text-slate">across all cases</span>
      </div>

      <div className="p-5">
        {chartData.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-soft">No delayed stages recorded right now.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
                barCategoryGap="24%"
              >
                <CartesianGrid horizontal={false} stroke="var(--color-hairline)" />
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis
                  type="category"
                  dataKey="stageName"
                  tick={{ fontSize: 11, fill: "var(--color-ink-soft)" }}
                  axisLine={false}
                  tickLine={false}
                  width={150}
                />
                <Tooltip cursor={{ fill: "var(--color-paper-dim)" }} content={<ChartTooltip />} />
                <Bar dataKey="delayedCount" name="Delayed cases" radius={[0, 2, 2, 0]} maxBarSize={20}>
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.stageName}
                      fill={entry.delayedCount === worst ? "var(--color-danger)" : "var(--color-navy-600)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {chartData.length > 0 && (
        <p className="border-t border-hairline px-5 py-3 text-xs text-slate">
          {chartData.find((d) => d.delayedCount === worst)?.stageName} has the most delayed cases, averaging{" "}
          {chartData.find((d) => d.delayedCount === worst)?.averageDelayDays} days overdue.
        </p>
      )}
    </section>
  );
}

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { GitBranch } from "lucide-react";
import type { ApiStageDistributionPoint } from "../../types/api";
import { ChartTooltip } from "./ChartTooltip";

// Ten muted, mostly-monochrome slices drawn from the existing design tokens.
// Gold is reserved for a single slice (the final stage) rather than spread
// across the palette, matching the "use gold sparingly" design principle.
const SLICE_COLORS = [
  "var(--color-navy-950)",
  "var(--color-navy-800)",
  "var(--color-navy-700)",
  "var(--color-navy-600)",
  "var(--color-navy-500)",
  "var(--color-info)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-neutral)",
  "var(--color-gold-500)",
];

export function StageDistributionChart({ data }: { data: ApiStageDistributionPoint[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <section className="border border-hairline bg-white" aria-labelledby="stage-distribution-heading">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h2 id="stage-distribution-heading" className="flex items-center gap-2 font-display text-lg text-navy-950">
          <GitBranch className="h-4 w-4 text-navy-700" strokeWidth={1.75} aria-hidden="true" />
          Acquisition Stage Distribution
        </h2>
        <span className="font-mono text-xs text-slate">{total} cases</span>
      </div>

      <div className="p-5">
        {total === 0 ? (
          <p className="py-12 text-center text-sm text-ink-soft">No case data available.</p>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="stageName"
                  cx="50%"
                  cy="46%"
                  innerRadius="55%"
                  outerRadius="80%"
                  paddingAngle={1.5}
                  stroke="var(--color-paper)"
                  strokeWidth={2}
                >
                  {data.map((entry) => (
                    <Cell
                      key={entry.stageNumber}
                      fill={SLICE_COLORS[(entry.stageNumber - 1) % SLICE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: "var(--color-ink-soft)", paddingTop: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}

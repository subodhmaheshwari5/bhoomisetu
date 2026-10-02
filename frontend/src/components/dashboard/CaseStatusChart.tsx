import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { ClipboardList } from "lucide-react";
import type { CaseStatus } from "../../types";
import type { ApiCaseStatusPoint } from "../../types/api";
import { ChartTooltip } from "./ChartTooltip";

// Mirrors the tone mapping in components/ui/StatusBadge.tsx (CASE_STATUS_MAP)
// so a "Delayed" bar here and a "Delayed" badge elsewhere read as the same
// color language. Exhaustive over CaseStatus — a missing key would paint the
// bar with `undefined` and render it invisible.
const STATUS_COLORS: Record<CaseStatus, string> = {
  completed: "var(--color-info)",
  on_track: "var(--color-success)",
  in_progress: "var(--color-info)",
  at_risk: "var(--color-warning)",
  delayed: "var(--color-danger)",
  on_hold: "var(--color-neutral)",
};

const STATUS_LABELS: Record<CaseStatus, string> = {
  completed: "Completed",
  on_track: "On Track",
  in_progress: "In Progress",
  at_risk: "At Risk",
  delayed: "Delayed",
  on_hold: "On Hold",
};

export function CaseStatusChart({ data }: { data: ApiCaseStatusPoint[] }) {
  const chartData = data.map((point) => ({ ...point, label: STATUS_LABELS[point.status] }));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <section className="border border-hairline bg-white" aria-labelledby="case-status-heading">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h2 id="case-status-heading" className="flex items-center gap-2 font-display text-lg text-navy-950">
          <ClipboardList className="h-4 w-4 text-navy-700" strokeWidth={1.75} aria-hidden="true" />
          Case Status
        </h2>
        <span className="font-mono text-xs text-slate">{total} cases</span>
      </div>

      <div className="p-5">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 8, right: 28, bottom: 0, left: 8 }}
              barCategoryGap="30%"
            >
              <CartesianGrid horizontal={false} stroke="var(--color-hairline)" />
              <XAxis type="number" allowDecimals={false} hide />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 12, fill: "var(--color-ink-soft)" }}
                axisLine={false}
                tickLine={false}
                width={84}
              />
              <Tooltip cursor={{ fill: "var(--color-paper-dim)" }} content={<ChartTooltip />} />
              <Bar dataKey="count" name="Cases" radius={[0, 2, 2, 0]} maxBarSize={28}>
                {chartData.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
                ))}
                <LabelList
                  dataKey="count"
                  position="right"
                  style={{ fontSize: 12, fontFamily: "var(--font-mono)", fill: "var(--color-navy-950)" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

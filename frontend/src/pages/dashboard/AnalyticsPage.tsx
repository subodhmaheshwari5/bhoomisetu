import { useEffect } from "react";
import { BarChart3, FileStack, TrendingDown, MapPinned, AlertOctagon, Gauge } from "lucide-react";
import { StatCard } from "../../components/ui/StatCard";
import { DemoTag } from "../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../../components/ui/AsyncState";
import { StageDistributionChart } from "../../components/dashboard/StageDistributionChart";
import { DistrictPerformanceChart } from "../../components/dashboard/DistrictPerformanceChart";
import { CaseStatusChart } from "../../components/dashboard/CaseStatusChart";
import { BottleneckChart } from "../../components/dashboard/BottleneckChart";
import { useApi } from "../../hooks/useApi";
import { useAIChat } from "../../hooks/useAIChat";
import { apiGet } from "../../services/apiClient";
import type { ApiAnalytics } from "../../types/api";

/**
 * The Analytics view.
 *
 * The same four charts appear on the Overview, so this page is deliberately not
 * just a copy of them. It adds the part the overview cannot show: figures
 * *derived* from those four datasets (health rate, worst stage, busiest
 * district) and a ranked bottleneck table. Every derived number below is
 * computed from the payload already in memory — no extra requests, and nothing
 * that can disagree with the charts it sits next to.
 */
export function AnalyticsPage() {
  const query = useApi(() => apiGet<ApiAnalytics>("/analytics"), []);
  const { setContext } = useAIChat();

  useEffect(() => {
    setContext({ page: "analytics" });
  }, [setContext]);

  if (query.loading) return <LoadingBlock label="Computing analytics…" />;
  if (query.error) {
    return (
      <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
        <ErrorBlock message={query.error} onRetry={query.refetch} />
      </div>
    );
  }

  const data = query.data;
  if (!data) return null;

  const total = data.caseStatus.reduce((sum, s) => sum + s.count, 0);
  const completed = data.caseStatus.find((s) => s.status === "completed")?.count ?? 0;
  const delayed = data.caseStatus.find((s) => s.status === "delayed")?.count ?? 0;
  const atRisk = data.caseStatus.find((s) => s.status === "at_risk")?.count ?? 0;

  // "Health rate" = everything not delayed and not at risk. Guarded so an empty
  // dataset renders 0% rather than NaN%.
  const healthRate = total === 0 ? 0 : Math.round(((total - delayed - atRisk) / total) * 100);

  // Worst stage = the one with the most delayed cases; ties break on the longer
  // average delay so the table reads as genuinely ranked rather than incidental.
  const worst = data.bottlenecks
    .filter((b) => b.delayedCount > 0)
    .sort((a, b) => b.delayedCount - a.delayedCount || b.averageDelayDays - a.averageDelayDays)[0];

  const busiest = data.districtPerformance[0];

  // Stages where work is currently sitting, most crowded first.
  const activeStages = data.stageDistribution
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-navy-950">
            <BarChart3 className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            Analytics
          </h1>
          <p className="mt-1 text-sm text-ink-soft">Pipeline health, bottlenecks and district performance</p>
        </div>
        <DemoTag label="Live data · demo dataset" />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Cases" value={total} icon={FileStack} />
        <StatCard
          label="On-time Rate"
          value={`${healthRate}%`}
          icon={Gauge}
          tone={healthRate < 50 ? "danger" : healthRate < 75 ? "warning" : "default"}
        />
        <StatCard label="Delayed Cases" value={delayed} icon={AlertOctagon} tone="danger" />
        <StatCard label="Worst Stage Avg Delay" value={`${worst?.averageDelayDays ?? 0}d`} icon={TrendingDown} tone="warning" />
      </div>

      {/* Headline findings ---------------------------------------------- */}
      <section className="mt-6 border-l-2 border-navy-900 bg-navy-50/60 px-4 py-3" aria-label="Key findings">
        <ul className="space-y-1 text-sm text-ink">
          <li>
            <span className="font-medium text-navy-950">{healthRate}% of cases are on time</span>
            {total > 0 && (
              <span className="text-ink-soft">
                {" "}
                — {completed} completed, {delayed} delayed, {atRisk} at risk across {total} total.
              </span>
            )}
          </li>
          {worst ? (
            <li className="text-ink-soft">
              <span className="font-medium text-navy-950">{worst.stageName}</span> is the strongest bottleneck:{" "}
              {worst.delayedCount} delayed {worst.delayedCount === 1 ? "case" : "cases"} averaging{" "}
              {worst.averageDelayDays} days late.
            </li>
          ) : (
            <li className="text-ink-soft">No stage currently has delayed cases.</li>
          )}
          {busiest && busiest.cases > 0 && (
            <li className="text-ink-soft">
              <span className="font-medium text-navy-950">{busiest.district}</span> carries the most acquisition
              caseload at {busiest.cases} {busiest.cases === 1 ? "case" : "cases"}.
            </li>
          )}
        </ul>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StageDistributionChart data={data.stageDistribution} />
        <DistrictPerformanceChart data={data.districtPerformance} />
      </div>

      <div className="mt-6">
        <CaseStatusChart data={data.caseStatus} />
      </div>

      <div className="mt-6">
        <BottleneckChart data={data.bottlenecks} />
      </div>

      {/* Where work is actually sitting ---------------------------------- */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="border border-hairline bg-white" aria-labelledby="active-stages-heading">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <h2 id="active-stages-heading" className="font-display text-lg text-navy-950">
              Where cases are sitting
            </h2>
            <span className="font-mono text-xs text-slate">Top 5 stages</span>
          </div>
          {activeStages.length === 0 ? (
            <div className="p-2">
              <EmptyBlock message="No cases are currently at a workflow stage." />
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-paper-dim/50 text-xs text-slate">
                  <th className="px-5 py-2.5 font-mono font-medium">Stage</th>
                  <th className="px-5 py-2.5 font-medium">Cases</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {activeStages.map((s) => (
                  <tr key={s.stageNumber} className="hover:bg-paper-dim/40">
                    <td className="px-5 py-2.5 text-ink">
                      <span className="mr-2 font-mono text-xs text-slate">{s.stageNumber}</span>
                      {s.stageName}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-ink-soft">{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="border border-hairline bg-white" aria-labelledby="bottleneck-table-heading">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <h2
              id="bottleneck-table-heading"
              className="flex items-center gap-2 font-display text-lg text-navy-950"
            >
              <MapPinned className="h-4 w-4 text-navy-700" strokeWidth={1.75} aria-hidden="true" />
              Bottlenecks by stage
            </h2>
          </div>
          {data.bottlenecks.every((b) => b.delayedCount === 0) ? (
            <div className="p-2">
              <EmptyBlock message="No stage has delayed cases." />
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-paper-dim/50 text-xs text-slate">
                  <th className="px-5 py-2.5 font-medium">Stage</th>
                  <th className="px-5 py-2.5 font-medium">Delayed</th>
                  <th className="px-5 py-2.5 font-medium">Avg Delay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {[...data.bottlenecks]
                  .sort((a, b) => b.delayedCount - a.delayedCount || b.averageDelayDays - a.averageDelayDays)
                  .map((b) => (
                    <tr key={b.stageName} className={b.delayedCount === 0 ? "text-slate" : "hover:bg-paper-dim/40"}>
                      <td className="px-5 py-2.5 text-ink">{b.stageName}</td>
                      <td className="px-5 py-2.5 font-mono text-ink-soft">{b.delayedCount}</td>
                      <td className="px-5 py-2.5 font-mono text-ink-soft">
                        {b.delayedCount === 0 ? "—" : `${b.averageDelayDays}d`}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

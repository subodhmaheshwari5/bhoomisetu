import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import type { ApiPriorityAlert } from "../../types/api";
import { RiskBadge } from "../ui/StatusBadge";
import { EmptyBlock } from "../ui/AsyncState";

export function PriorityAlertsPanel({ alerts }: { alerts: ApiPriorityAlert[] }) {
  return (
    <section className="border border-hairline bg-white">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h2 className="flex items-center gap-2 font-display text-lg text-navy-950">
          <AlertTriangle className="h-4 w-4 text-danger" strokeWidth={1.75} />
          Priority Alerts
        </h2>
        <span className="font-mono text-xs text-slate">{alerts.length} open</span>
      </div>

      {alerts.length === 0 ? (
        <div className="px-5 py-2">
          <EmptyBlock message="No overdue cases right now." />
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {alerts.map((alert) => (
            <li
              key={alert.caseId}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge risk={alert.riskLevel} />
                  <span className="font-mono text-sm text-navy-950">{alert.caseNumber}</span>
                </div>
                <p className="mt-1.5 text-sm text-ink-soft">{alert.issue}</p>
                <p className="mt-1 text-xs text-slate">
                  Open for {alert.durationDays} days · Recommended: {alert.recommendedAction}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  to={`/dashboard/cases/${alert.caseId}`}
                  className="border border-hairline px-3 py-1.5 text-xs font-medium text-navy-900 hover:bg-paper-dim"
                >
                  View Case
                </Link>
                <button className="border border-hairline px-3 py-1.5 text-xs font-medium text-navy-900 hover:bg-paper-dim">
                  Assign Officer
                </button>
                <button className="px-3 py-1.5 text-xs font-medium text-slate hover:text-ink">Dismiss</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

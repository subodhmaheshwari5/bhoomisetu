import { Banknote } from "lucide-react";
import { Link } from "react-router-dom";
import { DemoTag } from "../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../../components/ui/AsyncState";
import { useApi } from "../../hooks/useApi";
import { apiGet } from "../../services/apiClient";
import type { ApiCompensation } from "../../types/api";

function formatAmount(value: string | null): string {
  if (value === null) return "—";
  const amount = Number(value);
  return Number.isNaN(amount) ? "—" : `₹${amount.toLocaleString("en-IN")}`;
}

export function CompensationPage() {
  const query = useApi(() => apiGet<ApiCompensation[]>("/compensation"), []);

  return (
    <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-navy-950">
            <Banknote className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            Compensation
          </h1>
          <p className="mt-1 text-sm text-ink-soft">Assessment, approval and disbursement per case</p>
        </div>
        <DemoTag label="Live data · demo dataset" />
      </div>

      {query.loading && <LoadingBlock label="Loading compensation records…" />}
      {!query.loading && query.error && (
        <div className="mt-6">
          <ErrorBlock message={query.error} onRetry={query.refetch} />
        </div>
      )}

      {!query.loading && !query.error && (
        <div className="mt-6 overflow-x-auto border border-hairline bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline bg-paper-dim/50 text-xs text-slate">
                <th className="px-4 py-3 font-mono font-medium">Case ID</th>
                <th className="px-4 py-3 font-medium">Assessment Amount</th>
                <th className="px-4 py-3 font-medium">Approval</th>
                <th className="px-4 py-3 font-medium">Disbursement</th>
                <th className="px-4 py-3 font-medium">Payment Date</th>
                <th className="px-4 py-3 font-medium">Payment Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {(query.data ?? []).map((row) => (
                <tr key={row.id} className="hover:bg-paper-dim/40">
                  <td className="px-4 py-3">
                    <Link
                      to={`/dashboard/cases/${row.caseId}`}
                      className="font-mono text-navy-900 underline decoration-hairline underline-offset-4 hover:text-navy-700"
                    >
                      {row.caseNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-ink-soft">{formatAmount(row.assessmentAmount)}</td>
                  <td className="px-4 py-3 text-ink-soft capitalize">{row.approvalStatus.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-ink-soft capitalize">{row.disbursementStatus}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate">
                    {row.paymentDate ? row.paymentDate.slice(0, 10) : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate">{row.paymentReference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(query.data ?? []).length === 0 && (
            <div className="px-4 py-2">
              <EmptyBlock message="No compensation records yet." />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

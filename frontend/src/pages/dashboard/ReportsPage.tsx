import { useState } from "react";
import { FileBarChart, Download } from "lucide-react";
import { DemoTag } from "../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../../components/ui/AsyncState";
import { useApi } from "../../hooks/useApi";
import { apiGet, downloadCsv } from "../../services/apiClient";

type ReportType = "progress" | "delayed" | "compensation" | "district-performance" | "grievance-status";

const REPORT_OPTIONS: { value: ReportType; label: string }[] = [
  { value: "progress", label: "Acquisition Progress" },
  { value: "delayed", label: "Delayed Cases" },
  { value: "compensation", label: "Compensation Status" },
  { value: "district-performance", label: "District Performance" },
  { value: "grievance-status", label: "Grievance Status" },
];

export function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("progress");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const query = useApi(
    () => apiGet<Record<string, unknown>[]>("/reports", { type: reportType }),
    [reportType],
  );

  const rows = query.data ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  async function handleExport() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadCsv("/reports", { type: reportType }, `${reportType}-report.csv`);
    } catch {
      setDownloadError("Could not download the CSV export.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-navy-950">
            <FileBarChart className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            Reports
          </h1>
          <p className="mt-1 text-sm text-ink-soft">Generate and export acquisition reports</p>
        </div>
        <DemoTag label="Live data · demo dataset" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={reportType}
          onChange={(e) => setReportType(e.target.value as ReportType)}
          className="border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
        >
          {REPORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleExport}
          disabled={downloading || rows.length === 0}
          className="flex items-center gap-1.5 border border-hairline px-3 py-2 text-sm font-medium text-navy-900 hover:bg-paper-dim disabled:opacity-60"
        >
          <Download className="h-4 w-4" strokeWidth={1.75} />
          {downloading ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {downloadError && <p className="mt-2 text-xs text-danger">{downloadError}</p>}

      {query.loading && <LoadingBlock label="Generating report…" />}
      {!query.loading && query.error && (
        <div className="mt-6">
          <ErrorBlock message={query.error} onRetry={query.refetch} />
        </div>
      )}

      {!query.loading && !query.error && (
        <div className="mt-6 overflow-x-auto border border-hairline bg-white">
          {rows.length === 0 ? (
            <div className="px-4 py-2">
              <EmptyBlock message="This report has no rows for the current dataset." />
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-paper-dim/50 text-xs text-slate">
                  {columns.map((col) => (
                    <th key={col} className="px-4 py-3 font-medium capitalize">
                      {col.replace(/_/g, " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-paper-dim/40">
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-3 text-ink-soft">
                        {row[col] === null || row[col] === undefined ? "—" : String(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Home, Search as SearchIcon, Users, AlertTriangle, CheckCircle2, HandHeart, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { DemoTag } from "../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../../components/ui/AsyncState";
import { StatCard } from "../../components/ui/StatCard";
import { useApi } from "../../hooks/useApi";
import { useAIChat } from "../../hooks/useAIChat";
import { apiGet } from "../../services/apiClient";
import type {
  ApiRehabilitationRecord,
  ApiRehabilitationStatusOption,
  ApiRehabilitationSummary,
} from "../../types/api";
import type { RehabilitationStatus } from "../../types/api";

/**
 * Visual treatment per R&R status. Kept local to this page because the status
 * column is a TEXT set rather than a shared enum, so there is no global badge
 * component for it the way DocumentStatus has.
 *
 * `Record<RehabilitationStatus, ...>` means the compiler fails if a status is
 * added to the union without a label here, so the twelve statuses cannot
 * silently lose their badge. `in_progress` is toned as active rather than
 * terminal, matching its meaning as an in-flight state.
 */
const STATUS_TONE: Record<RehabilitationStatus, { label: string; className: string }> = {
  not_started: { label: "Not Started", className: "bg-neutral-bg text-neutral" },
  in_progress: { label: "In Progress", className: "bg-info-bg text-info" },
  eligibility_pending: { label: "Eligibility Pending", className: "bg-warning-bg text-warning" },
  eligible: { label: "Eligible", className: "bg-info-bg text-info" },
  entitlement_pending: { label: "Entitlement Pending", className: "bg-warning-bg text-warning" },
  entitlement_approved: { label: "Entitlement Approved", className: "bg-info-bg text-info" },
  assistance_pending: { label: "Assistance Pending", className: "bg-warning-bg text-warning" },
  assistance_provided: { label: "Assistance Provided", className: "bg-info-bg text-info" },
  resettlement_pending: { label: "Resettlement Pending", className: "bg-warning-bg text-warning" },
  resettled: { label: "Resettled", className: "bg-success-bg text-success" },
  completed: { label: "Completed", className: "bg-success-bg text-success" },
  disputed: { label: "Disputed", className: "bg-danger-bg text-danger" },
};

/** The R&R package components, shown as a compact checklist. */
const PACKAGE_ITEMS: { key: keyof ApiRehabilitationRecord; label: string }[] = [
  { key: "entitlement", label: "Entitlement" },
  { key: "assistance", label: "Assistance" },
  { key: "housing", label: "Housing" },
  { key: "livelihood", label: "Livelihood" },
  { key: "resettlement", label: "Resettlement" },
];

function StatusPill({ status }: { status: RehabilitationStatus }) {
  const tone = STATUS_TONE[status] ?? { label: status, className: "bg-neutral-bg text-neutral" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium ${tone.className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {tone.label}
    </span>
  );
}

export function RehabilitationPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const { setContext } = useAIChat();

  useEffect(() => {
    setContext({ page: "rehabilitation" });
  }, [setContext]);

  // The status list comes from the backend so the filter menu cannot drift from
  // the values actually stored in the TEXT column.
  const statusOptions = useApi(() => apiGet<{ statuses: ApiRehabilitationStatusOption[] }>("/rehabilitation/statuses"), []);

  const summary = useApi(() => apiGet<ApiRehabilitationSummary>("/rehabilitation/summary"), []);

  const query = useApi(
    () =>
      apiGet<ApiRehabilitationRecord[]>("/rehabilitation", {
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(status ? { status } : {}),
      }),
    [search, status],
  );

  const rows = query.data ?? [];
  const filtering = Boolean(search.trim() || status);

  return (
    <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-navy-950">
            <Home className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            Rehabilitation &amp; Resettlement
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {query.loading
              ? "Loading…"
              : `${rows.length} record${rows.length === 1 ? "" : "s"} in your scope`}
          </p>
        </div>
        <DemoTag label="Live data · demo dataset" />
      </div>

      {summary.data && (
        // The three primary buckets are mutually exclusive and sum to the total:
        // completed + in flight (active, which includes `in_progress`) + not
        // started. `disputed` is an overlay, so it is reported beside them
        // rather than as a fourth bucket.
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="R&R Records" value={summary.data.total} icon={Users} />
          <StatCard label="In Flight" value={summary.data.inFlight} icon={HandHeart} />
          <StatCard label="Not Started" value={summary.data.notStarted} icon={Clock} />
          <StatCard
            label="Completed"
            value={`${summary.data.completed} · ${summary.data.completionRate}%`}
            icon={CheckCircle2}
          />
          <StatCard
            label="Disputed"
            value={summary.data.disputed}
            icon={AlertTriangle}
            tone={summary.data.disputed > 0 ? "danger" : "default"}
          />
        </div>
      )}

      {/* Filters ------------------------------------------------------- */}
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="rr-search" className="block text-[11px] font-medium uppercase tracking-wide text-slate">
            Search
          </label>
          <div className="relative mt-1">
            <SearchIcon
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              id="rr-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Case number, ULPIN, or affected family"
              className="w-full border border-hairline bg-white py-1.5 pl-8 pr-2 text-sm text-ink placeholder:text-slate"
            />
          </div>
        </div>

        <div>
          <label htmlFor="rr-status" className="block text-[11px] font-medium uppercase tracking-wide text-slate">
            Status
          </label>
          <select
            id="rr-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 border border-hairline bg-white px-2 py-1.5 text-sm text-ink"
          >
            <option value="">All statuses</option>
            {(statusOptions.data?.statuses ?? []).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {filtering && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStatus("");
            }}
            className="border border-hairline px-2.5 py-1.5 text-xs font-medium text-navy-900 hover:bg-paper-dim"
          >
            Clear
          </button>
        )}
      </div>

      {query.loading && <LoadingBlock label="Loading R&R records…" />}
      {!query.loading && query.error && (
        <div className="mt-6">
          <ErrorBlock message={query.error} onRetry={query.refetch} />
        </div>
      )}

      {!query.loading && !query.error && rows.length > 0 && (
        <div className="mt-6 space-y-4">
          {rows.map((r) => (
            <article key={r.id} className="border border-hairline bg-white">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/dashboard/cases/${r.caseId}`}
                      className="font-mono text-sm text-navy-900 underline decoration-hairline underline-offset-4 hover:text-navy-700"
                    >
                      {r.caseNumber}
                    </Link>
                    <span className="text-xs text-slate">Stage {r.currentStage}</span>
                  </div>
                  <p className="mt-1 text-sm text-navy-950">
                    {r.affectedFamily ?? "Affected family not recorded"}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate">
                    {r.ulpin ?? "No parcel"} · {r.districtName}
                    {r.targetDate && ` · target ${r.targetDate.slice(0, 10)}`}
                  </p>
                </div>
                <StatusPill status={r.status} />
              </header>

              <div className="px-5 py-4">
                {r.details && <p className="text-sm text-ink-soft">{r.details}</p>}

                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  <div className="flex gap-2 text-sm">
                    <dt className="w-24 shrink-0 text-slate">Eligibility</dt>
                    <dd className="text-ink">{r.eligibility ?? "—"}</dd>
                  </div>
                  {PACKAGE_ITEMS.map((item) => {
                    const value = r[item.key];
                    if (!value) return null;
                    return (
                      <div key={item.key} className="flex gap-2 text-sm">
                        <dt className="w-24 shrink-0 text-slate">{item.label}</dt>
                        <dd className="text-ink">{String(value)}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            </article>
          ))}
        </div>
      )}

      {!query.loading && !query.error && rows.length === 0 && (
        <div className="mt-6">
          <EmptyBlock
            message={
              filtering
                ? "No R&R records match these filters within your scope."
                : "No rehabilitation records are available for your account."
            }
          />
        </div>
      )}
    </div>
  );
}

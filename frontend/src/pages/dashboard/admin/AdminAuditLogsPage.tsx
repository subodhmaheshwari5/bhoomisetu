import { Fragment, useState } from "react";
import { ScrollText, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { DemoTag } from "../../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../../../components/ui/AsyncState";
import { useApi } from "../../../hooks/useApi";
import { apiGet } from "../../../services/apiClient";
import { ROLE_LABELS } from "../../../data/authData";
import type { ApiAuditFacet, ApiAuditLogEntry, ApiAuditLogPage } from "../../../types/api";

const PAGE_SIZE = 25;

/** Renders a stored JSONB value compactly without pretending to interpret it. */
function ValueCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-slate">—</span>;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return <span className="text-slate">—</span>;
  return <code className="font-mono text-[11px] text-ink-soft">{text}</code>;
}

export function AdminAuditLogsPage() {
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  /**
   * Changing a filter also resets the offset, otherwise a later page can land
   * past the end of the new, smaller result set.
   */
  function applyFilter(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(0);
    };
  }

  const facets = useApi(() => apiGet<ApiAuditFacet[]>("/admin/audit-logs/facets"), []);

  const query = useApi(
    () =>
      apiGet<ApiAuditLogPage>("/admin/audit-logs", {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        ...(entity ? { entity } : {}),
        ...(action ? { action } : {}),
      }),
    [entity, action, page],
  );

  const entities = (facets.data ?? []).filter((f) => f.kind === "entity");
  const actions = (facets.data ?? []).filter((f) => f.kind === "action");

  const data = query.data;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function renderRow(entry: ApiAuditLogEntry) {
    const isOpen = expanded === entry.id;
    return (
      <tr key={entry.id} className="align-top hover:bg-paper-dim/40">
        <td className="px-4 py-2.5 text-xs whitespace-nowrap text-ink-soft">
          {new Date(entry.createdAt).toLocaleString()}
        </td>
        <td className="px-4 py-2.5 text-sm text-navy-950">
          {entry.userName ?? <span className="text-slate">System</span>}
          {entry.userRole && (
            <span className="block text-[11px] text-slate">{ROLE_LABELS[entry.userRole]}</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-sm text-ink-soft">{entry.action}</td>
        <td className="px-4 py-2.5 text-sm text-ink-soft">{entry.entity}</td>
        <td className="px-4 py-2.5">
          <button
            type="button"
            onClick={() => setExpanded(isOpen ? null : entry.id)}
            aria-expanded={isOpen}
            className="inline-flex items-center gap-1 text-xs text-navy-700 hover:underline"
          >
            {isOpen ? (
              <ChevronUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            )}
            {isOpen ? "Hide" : "Details"}
          </button>
        </td>
      </tr>
    );
  }

  return (
    <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-navy-950">
            <ScrollText className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            Audit Logs
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Every recorded change, who made it, and when. Newest first.
          </p>
        </div>
        <DemoTag label="Live data · demo dataset" />
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px]">
          <label
            htmlFor="audit-entity"
            className="block text-[11px] font-medium uppercase tracking-wide text-slate"
          >
            Entity
          </label>
          <select
            id="audit-entity"
            value={entity}
            onChange={(e) => applyFilter(setEntity)(e.target.value)}
            className="mt-1 w-full border border-hairline bg-white px-3 py-2 text-sm text-navy-900 focus:border-navy-500 focus:outline-none"
          >
            <option value="">All entities</option>
            {entities.map((f) => (
              <option key={f.value} value={f.value}>
                {f.value} ({f.count})
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px]">
          <label
            htmlFor="audit-action"
            className="block text-[11px] font-medium uppercase tracking-wide text-slate"
          >
            Action
          </label>
          <select
            id="audit-action"
            value={action}
            onChange={(e) => applyFilter(setAction)(e.target.value)}
            className="mt-1 w-full border border-hairline bg-white px-3 py-2 text-sm text-navy-900 focus:border-navy-500 focus:outline-none"
          >
            <option value="">All actions</option>
            {actions.map((f) => (
              <option key={f.value} value={f.value}>
                {f.value} ({f.count})
              </option>
            ))}
          </select>
        </div>
        <p className="pb-2 text-xs text-slate">
          {query.loading ? "Loading…" : `${total} entr${total === 1 ? "y" : "ies"}`}
        </p>
      </div>

      {query.loading && <div className="mt-4"><LoadingBlock label="Loading audit log…" /></div>}
      {!query.loading && query.error && (
        <div className="mt-4">
          <ErrorBlock message={query.error} onRetry={query.refetch} />
        </div>
      )}

      {!query.loading && !query.error && data && (
        <>
          {data.entries.length === 0 ? (
            <div className="mt-4">
              <EmptyBlock message="No audit entries match the current filters." />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto border border-hairline bg-white">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-paper-dim/50 text-xs text-slate">
                    <th scope="col" className="px-4 py-3 font-medium">When</th>
                    <th scope="col" className="px-4 py-3 font-medium">User</th>
                    <th scope="col" className="px-4 py-3 font-medium">Action</th>
                    <th scope="col" className="px-4 py-3 font-medium">Entity</th>
                    <th scope="col" className="px-4 py-3 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {data.entries.map((entry) => (
                    <Fragment key={entry.id}>
                      {renderRow(entry)}
                      {expanded === entry.id && (
                        <tr className="bg-paper-dim/40">
                          <td colSpan={5} className="px-4 py-3">
                            <dl className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate">
                                  Entity id
                                </dt>
                                <dd className="mt-0.5 font-mono text-xs text-navy-900">{entry.entityId}</dd>
                              </div>
                              <div>
                                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate">
                                  Previous value
                                </dt>
                                <dd className="mt-0.5">
                                  <ValueCell value={entry.previousValue} />
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate">
                                  New value
                                </dt>
                                <dd className="mt-0.5">
                                  <ValueCell value={entry.newValue} />
                                </dd>
                              </div>
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pageCount > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="inline-flex items-center gap-1.5 border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-paper-dim disabled:cursor-not-allowed disabled:text-slate"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Previous
              </button>
              <span className="text-xs text-slate">
                Page {page + 1} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="inline-flex items-center gap-1.5 border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-paper-dim disabled:cursor-not-allowed disabled:text-slate"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
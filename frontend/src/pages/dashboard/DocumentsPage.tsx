import { useEffect, useState } from "react";
import { FolderKanban, Search as SearchIcon, FileText, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { DemoTag } from "../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../../components/ui/AsyncState";
import { DocumentStatusBadge } from "../../components/ui/StatusBadge";
import { useApi } from "../../hooks/useApi";
import { useAIChat } from "../../hooks/useAIChat";
import { apiGet } from "../../services/apiClient";
import type { ApiDocumentCategory, ApiDocumentRegisterRow } from "../../types/api";
import type { DocumentStatus } from "../../types";

/** Mirrors the `document_status` Postgres enum. */
const STATUS_FILTERS: { value: DocumentStatus; label: string }[] = [
  { value: "pending_verification", label: "Pending Verification" },
  { value: "under_review", label: "Under Review" },
  { value: "uploaded", label: "Uploaded" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "missing", label: "Missing" },
  { value: "expired", label: "Expired" },
  { value: "superseded", label: "Superseded" },
];

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const { setContext } = useAIChat();

  useEffect(() => {
    setContext({ page: "documents" });
  }, [setContext]);

  // Category counts come from the same scoped service as the rows, so the menu
  // can never advertise a category the caller is not allowed to see.
  const categories = useApi(() => apiGet<ApiDocumentCategory[]>("/documents/categories"), []);

  const query = useApi(
    () =>
      apiGet<ApiDocumentRegisterRow[]>("/documents", {
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
      }),
    [search, status, category],
  );

  const rows = query.data ?? [];
  const filtering = Boolean(search.trim() || status || category);

  return (
    <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-navy-950">
            <FolderKanban className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            Documents
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {query.loading ? "Loading…" : `${rows.length} document${rows.length === 1 ? "" : "s"} in your scope`}
          </p>
        </div>
        <DemoTag label="Live data · demo dataset" />
      </div>

      {/* Filters ------------------------------------------------------- */}
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="doc-search" className="block text-[11px] font-medium uppercase tracking-wide text-slate">
            Search
          </label>
          <div className="relative mt-1">
            <SearchIcon
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              id="doc-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="File name, case number, or reference"
              className="w-full border border-hairline bg-white py-1.5 pl-8 pr-2 text-sm text-ink placeholder:text-slate"
            />
          </div>
        </div>

        <div>
          <label htmlFor="doc-status" className="block text-[11px] font-medium uppercase tracking-wide text-slate">
            Status
          </label>
          <select
            id="doc-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 border border-hairline bg-white px-2 py-1.5 text-sm text-ink"
          >
            <option value="">All statuses</option>
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="doc-category" className="block text-[11px] font-medium uppercase tracking-wide text-slate">
            Category
          </label>
          <select
            id="doc-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 max-w-[240px] border border-hairline bg-white px-2 py-1.5 text-sm text-ink"
          >
            <option value="">All categories</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.category} value={c.category}>
                {c.category} ({c.count})
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
              setCategory("");
            }}
            className="border border-hairline px-2.5 py-1.5 text-xs font-medium text-navy-900 hover:bg-paper-dim"
          >
            Clear
          </button>
        )}
      </div>

      {query.loading && <LoadingBlock label="Loading documents…" />}
      {!query.loading && query.error && (
        <div className="mt-6">
          <ErrorBlock message={query.error} onRetry={query.refetch} />
        </div>
      )}

      {!query.loading && !query.error && rows.length > 0 && (
        <div className="mt-6 overflow-x-auto border border-hairline bg-white">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline bg-paper-dim/50 text-xs text-slate">
                <th className="px-4 py-3 font-medium">Document</th>
                <th className="px-4 py-3 font-medium">Case</th>
                <th className="px-4 py-3 font-medium">District</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Uploaded</th>
                <th className="px-4 py-3 font-medium">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-paper-dim/40">
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate" strokeWidth={1.75} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-navy-950">{d.fileName}</p>
                        <p className="truncate text-xs text-ink-soft">{d.category}</p>
                        {d.documentRef && <p className="font-mono text-[11px] text-slate">{d.documentRef}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/dashboard/cases/${d.caseId}`}
                      className="font-mono text-xs text-navy-900 underline decoration-hairline underline-offset-4 hover:text-navy-700"
                    >
                      {d.caseNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{d.districtName}</td>
                  <td className="px-4 py-3">
                    <DocumentStatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 font-mono text-xs text-ink-soft">
                      <Layers className="h-3 w-3 text-slate" strokeWidth={1.75} aria-hidden="true" />
                      v{d.currentVersion}
                      {d.versionCount > 0 && <span className="text-slate">({d.versionCount})</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate">{formatDate(d.uploadedAt)}</td>
                  <td className="px-4 py-3 text-ink-soft">{d.uploadedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!query.loading && !query.error && rows.length === 0 && (
        <div className="mt-6">
          <EmptyBlock
            message={
              filtering
                ? "No documents match these filters within your scope."
                : "No documents are available for your account."
            }
          />
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, FileStack, Plus } from "lucide-react";
import { CaseStatusBadge, RiskBadge } from "../../components/ui/StatusBadge";
import { DemoTag } from "../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../../components/ui/AsyncState";
import { CaseCreateModal } from "../../components/case/CaseCreateModal";
import { useApi } from "../../hooks/useApi";
import { apiGet } from "../../services/apiClient";
import type { ApiCase } from "../../types/api";
import { useAuth } from "../../features/auth/useAuth";

const OFFICER_ROLES = ["super_admin", "dolr_officer", "state_officer", "district_officer"];

export function CaseListPage() {
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { user } = useAuth();
  const canCreate = user ? OFFICER_ROLES.includes(user.role) : false;

  const casesQuery = useApi(() => apiGet<ApiCase[]>("/cases"), []);

  const filtered = useMemo(() => {
    const cases = casesQuery.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter(
      (c) =>
        c.caseNumber.toLowerCase().includes(q) ||
        c.projectName.toLowerCase().includes(q) ||
        c.districtName.toLowerCase().includes(q) ||
        c.assignedOfficer.toLowerCase().includes(q),
    );
  }, [casesQuery.data, query]);

  return (
    <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-navy-950">
            <FileStack className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            Acquisition Cases
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{casesQuery.data?.length ?? 0} cases across 5 districts</p>
        </div>
        <div className="flex items-center gap-2">
          <DemoTag label="Live data · demo dataset" />
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 bg-navy-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-800"
            >
              <Plus className="h-3.5 w-3.5" />
              New Case
            </button>
          )}
        </div>
      </div>

      <label className="relative mt-6 block max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Case ID, project, district, officer…"
          className="w-full border border-hairline bg-white py-2 pl-9 pr-3 text-sm text-ink placeholder:text-slate focus:border-navy-500 focus:outline-none"
        />
      </label>

      {casesQuery.loading && <LoadingBlock label="Loading cases…" />}

      {!casesQuery.loading && casesQuery.error && (
        <div className="mt-6">
          <ErrorBlock message={casesQuery.error} onRetry={casesQuery.refetch} />
        </div>
      )}

      {!casesQuery.loading && !casesQuery.error && (
        <div className="mt-6 overflow-x-auto border border-hairline bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline bg-paper-dim/50 text-xs text-slate">
                <th className="px-4 py-3 font-mono font-medium">Case ID</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">District</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Risk</th>
                <th className="px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-paper-dim/40">
                  <td className="px-4 py-3">
                    <Link
                      to={`/dashboard/cases/${c.id}`}
                      className="font-mono text-navy-900 underline decoration-hairline underline-offset-4 hover:text-navy-700"
                    >
                      {c.caseNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{c.projectName}</td>
                  <td className="px-4 py-3 text-ink-soft">{c.districtName}</td>
                  <td className="px-4 py-3 text-ink-soft">{c.currentStage} / 10</td>
                  <td className="px-4 py-3">
                    <CaseStatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3">
                    <RiskBadge risk={c.riskLevel} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate">{c.updatedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="px-4 py-2">
              <EmptyBlock message={query ? `No cases match "${query}".` : "No cases found."} />
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CaseCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            casesQuery.refetch();
          }}
        />
      )}
    </div>
  );
}

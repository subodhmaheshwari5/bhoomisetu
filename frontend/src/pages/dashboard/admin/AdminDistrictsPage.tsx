import { useMemo, useState } from "react";
import { MapPinned, Search as SearchIcon } from "lucide-react";
import { DemoTag } from "../../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../../../components/ui/AsyncState";
import { StatCard } from "../../../components/ui/StatCard";
import { useApi } from "../../../hooks/useApi";
import { apiGet } from "../../../services/apiClient";
import type { ApiAdminDistrict } from "../../../types/api";

/**
 * Shared empty result. A `?? []` literal would be a new array on every render,
 * which defeats the memoization below and re-filters the list each time.
 */
const NO_DISTRICTS: ApiAdminDistrict[] = [];

export function AdminDistrictsPage() {
  const query = useApi(() => apiGet<ApiAdminDistrict[]>("/admin/districts"), []);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");

  const districts = query.data ?? NO_DISTRICTS;

  const states = useMemo(
    () => [...new Set(districts.map((d) => d.state ?? d.stateName))].sort(),
    [districts],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return districts.filter((d) => {
      const stateName = d.state ?? d.stateName;
      if (stateFilter && stateName !== stateFilter) return false;
      if (!term) return true;
      return (
        d.name.toLowerCase().includes(term) ||
        stateName.toLowerCase().includes(term) ||
        (d.code ?? "").toLowerCase().includes(term)
      );
    });
  }, [districts, search, stateFilter]);

  const caseTotal = districts.reduce((sum, d) => sum + d.caseCount, 0);
  const projectTotal = districts.reduce((sum, d) => sum + d.projectCount, 0);
  const busiest = districts.reduce(
    (max, d) => (d.caseCount > (max?.caseCount ?? -1) ? d : max),
    null as ApiAdminDistrict | null,
  );

  return (
    <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-navy-950">
            <MapPinned className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            Districts
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            District register with workload, so an unbalanced district is visible at a glance.
          </p>
        </div>
        <DemoTag label="Live data · demo dataset" />
      </div>

      {query.loading && <LoadingBlock label="Loading districts…" />}
      {!query.loading && query.error && (
        <div className="mt-6">
          <ErrorBlock message={query.error} onRetry={query.refetch} />
        </div>
      )}

      {!query.loading && !query.error && districts.length === 0 && (
        <div className="mt-6">
          <EmptyBlock message="No districts found." />
        </div>
      )}

      {!query.loading && !query.error && districts.length > 0 && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Districts" value={districts.length} icon={MapPinned} />
            <StatCard label="Cases" value={caseTotal} icon={MapPinned} />
            <StatCard label="Projects" value={projectTotal} icon={MapPinned} />
            <StatCard
              label="Busiest district"
              value={busiest ? busiest.name : "—"}
              icon={MapPinned}
              tone={busiest && busiest.caseCount > 0 ? "warning" : "default"}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <label
                htmlFor="district-search"
                className="block text-[11px] font-medium uppercase tracking-wide text-slate"
              >
                Search
              </label>
              <div className="relative mt-1">
                <SearchIcon
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <input
                  id="district-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="District, state, or code"
                  className="w-full border border-hairline bg-white py-2 pl-8 pr-3 text-sm text-navy-900 focus:border-navy-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="min-w-[200px]">
              <label
                htmlFor="district-state"
                className="block text-[11px] font-medium uppercase tracking-wide text-slate"
              >
                State
              </label>
              <select
                id="district-state"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="mt-1 w-full border border-hairline bg-white px-3 py-2 text-sm text-navy-900 focus:border-navy-500 focus:outline-none"
              >
                <option value="">All states</option>
                {states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto border border-hairline bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-paper-dim/50 text-xs text-slate">
                  <th scope="col" className="px-4 py-3 font-medium">District</th>
                  <th scope="col" className="px-4 py-3 font-medium">State</th>
                  <th scope="col" className="px-4 py-3 font-medium">Code</th>
                  <th scope="col" className="px-4 py-3 font-medium">Cases</th>
                  <th scope="col" className="px-4 py-3 font-medium">Projects</th>
                  <th scope="col" className="px-4 py-3 font-medium">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {visible.map((district) => (
                  <tr key={district.id} className="hover:bg-paper-dim/40">
                    <td className="px-4 py-3 text-navy-950">{district.name}</td>
                    <td className="px-4 py-3 text-ink-soft">{district.state ?? district.stateName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">{district.code ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-soft">{district.caseCount}</td>
                    <td className="px-4 py-3 text-ink-soft">{district.projectCount}</td>
                    <td className="px-4 py-3">
                      {district.isActive ? (
                        <span className="bg-success-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-success">
                          Active
                        </span>
                      ) : (
                        <span className="bg-neutral-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral">
                          Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 && (
              <div className="px-4 py-2">
                <EmptyBlock message="No districts match the current filters." />
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-slate">
            Showing {visible.length} of {districts.length} districts.
          </p>
        </>
      )}
    </div>
  );
}
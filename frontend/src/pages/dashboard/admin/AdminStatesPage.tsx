import { useMemo } from "react";
import { Landmark, MapPinned } from "lucide-react";
import { DemoTag } from "../../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../../../components/ui/AsyncState";
import { StatCard } from "../../../components/ui/StatCard";
import { useApi } from "../../../hooks/useApi";
import { apiGet } from "../../../services/apiClient";
import type { ApiAdminDistrict, ApiAdminState } from "../../../types/api";

/**
 * Shared empty results. A `?? []` literal would be a new array on every render,
 * which defeats the memoization below.
 */
const NO_STATES: ApiAdminState[] = [];
const NO_DISTRICTS: ApiAdminDistrict[] = [];

export function AdminStatesPage() {
  const states = useApi(() => apiGet<ApiAdminState[]>("/admin/states"), []);
  const districts = useApi(() => apiGet<ApiAdminDistrict[]>("/admin/districts"), []);

  const rows = states.data ?? NO_STATES;
  const allDistricts = districts.data ?? NO_DISTRICTS;

  const totalDistricts = rows.reduce((sum, s) => sum + s.districtCount, 0);

  // District counts come from the states endpoint, but the district list is the
  // place an administrator looks for the ones with no cases, so it is fetched too.
  const districtsWithoutCases = useMemo(
    () => allDistricts.filter((d) => d.caseCount === 0).length,
    [allDistricts],
  );

  const byState = useMemo(() => {
    const map = new Map<string, ApiAdminDistrict[]>();
    for (const d of allDistricts) {
      const key = d.state ?? d.stateName;
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [allDistricts]);

  const loading = states.loading || districts.loading;
  const error = states.error ?? districts.error;

  return (
    <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-navy-950">
            <Landmark className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            States
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            State-level structure and the districts, cases, and projects beneath each one.
          </p>
        </div>
        <DemoTag label="Live data · demo dataset" />
      </div>

      {loading && <LoadingBlock label="Loading states…" />}
      {!loading && error && (
        <div className="mt-6">
          <ErrorBlock message={error} onRetry={() => { states.refetch(); districts.refetch(); }} />
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="mt-6">
          <EmptyBlock message="No states found." />
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="States" value={rows.length} icon={Landmark} />
            <StatCard label="Districts" value={totalDistricts} icon={MapPinned} />
            <StatCard label="Projects" value={allDistricts.reduce((s, d) => s + d.projectCount, 0)} icon={MapPinned} />
            <StatCard
              label="Districts with no cases"
              value={districtsWithoutCases}
              icon={MapPinned}
              tone={districtsWithoutCases > 0 ? "warning" : "default"}
            />
          </div>

          <div className="mt-6 overflow-x-auto border border-hairline bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-paper-dim/50 text-xs text-slate">
                  <th scope="col" className="px-4 py-3 font-medium">State</th>
                  <th scope="col" className="px-4 py-3 font-medium">Code</th>
                  <th scope="col" className="px-4 py-3 font-medium">Region</th>
                  <th scope="col" className="px-4 py-3 font-medium">Districts</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((state) => (
                  <tr key={state.id} className="hover:bg-paper-dim/40">
                    <td className="px-4 py-3 text-navy-950">{state.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">{state.code}</td>
                    <td className="px-4 py-3 text-ink-soft">{state.region ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-soft">{state.districtCount}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          state.status === "active"
                            ? "bg-success-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-success"
                            : "bg-neutral-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral"
                        }
                      >
                        {state.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mt-8 font-display text-lg text-navy-950">Districts by state</h2>
          <div className="mt-3 space-y-4">
            {byState.map(([stateName, list]) => (
              <div key={stateName} className="border border-hairline bg-white">
                <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
                  <h3 className="text-sm font-medium text-navy-950">{stateName}</h3>
                  <span className="text-xs text-slate">
                    {list.length} district{list.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="divide-y divide-hairline">
                  {list.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span className="flex items-center gap-2 text-navy-900">
                        {d.name}
                        {d.code && (
                          <span className="font-mono text-[10px] text-slate">{d.code}</span>
                        )}
                        {!d.isActive && (
                          <span className="bg-neutral-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral">
                            Inactive
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-slate">
                        {d.caseCount} case{d.caseCount === 1 ? "" : "s"} · {d.projectCount} project
                        {d.projectCount === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
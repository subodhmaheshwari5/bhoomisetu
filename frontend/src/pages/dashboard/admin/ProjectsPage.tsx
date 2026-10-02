import { Briefcase } from "lucide-react";
import { DemoTag } from "../../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../../../components/ui/AsyncState";
import { useApi } from "../../../hooks/useApi";
import { apiGet } from "../../../services/apiClient";
import type { ApiProject } from "../../../types/api";

export function ProjectsPage() {
  const query = useApi(() => apiGet<ApiProject[]>("/projects"), []);

  return (
    <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-navy-950">
            <Briefcase className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            Projects
          </h1>
          <p className="mt-1 text-sm text-ink-soft">Land-requiring projects across all districts</p>
        </div>
        <DemoTag label="Live data · demo dataset" />
      </div>

      {query.loading && <LoadingBlock label="Loading projects…" />}
      {!query.loading && query.error && (
        <div className="mt-6">
          <ErrorBlock message={query.error} onRetry={query.refetch} />
        </div>
      )}

      {!query.loading && !query.error && (
        <div className="mt-6 overflow-x-auto border border-hairline bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline bg-paper-dim/50 text-xs text-slate">
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Agency</th>
                <th className="px-4 py-3 font-medium">District</th>
                <th className="px-4 py-3 font-medium">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {(query.data ?? []).map((project) => (
                <tr key={project.id} className="hover:bg-paper-dim/40">
                  <td className="px-4 py-3 text-navy-950">{project.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{project.agency}</td>
                  <td className="px-4 py-3 text-ink-soft">{project.districtName}</td>
                  <td className="px-4 py-3 text-ink-soft">{project.stateName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(query.data ?? []).length === 0 && (
            <div className="px-4 py-2">
              <EmptyBlock message="No projects found." />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

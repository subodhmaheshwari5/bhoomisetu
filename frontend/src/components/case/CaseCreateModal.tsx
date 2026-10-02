import { useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { apiGet, apiPost, ApiRequestError } from "../../services/apiClient";
import { useApi } from "../../hooks/useApi";
import type { ApiCase, ApiParcel, ApiProject } from "../../types/api";
import { LoadingBlock } from "../ui/AsyncState";

interface CaseCreateModalProps {
  onClose: () => void;
  onCreated: (created: ApiCase) => void;
}

export function CaseCreateModal({ onClose, onCreated }: CaseCreateModalProps) {
  const projectsQuery = useApi(() => apiGet<ApiProject[]>("/projects"), []);
  const parcelsQuery = useApi(() => apiGet<ApiParcel[]>("/parcels"), []);

  const [projectId, setProjectId] = useState("");
  const [parcelId, setParcelId] = useState("");
  const [assignedOfficer, setAssignedOfficer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const project = projectsQuery.data?.find((p) => p.id === projectId);
    if (!project || !parcelId || !assignedOfficer.trim()) {
      setError("Please fill in every field.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const created = await apiPost<ApiCase>("/cases", {
        projectId,
        parcelId,
        districtId: project.districtId,
        assignedOfficer: assignedOfficer.trim(),
      });
      onCreated(created);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 403) {
        setError("Access denied: your account isn't authorized to create acquisition cases.");
      } else {
        setError(err instanceof ApiRequestError ? err.message : "Could not create the case.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 px-4">
      <div className="w-full max-w-md border border-hairline bg-white">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="font-display text-lg text-navy-950">New Acquisition Case</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        {projectsQuery.loading || parcelsQuery.loading ? (
          <LoadingBlock label="Loading form options…" />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
            <div>
              <label htmlFor="project" className="block text-xs font-medium text-ink-soft">
                Project
              </label>
              <select
                id="project"
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 w-full border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
              >
                <option value="">Select a project…</option>
                {projectsQuery.data?.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} ({project.districtName})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="parcel" className="block text-xs font-medium text-ink-soft">
                Parcel (ULPIN)
              </label>
              <select
                id="parcel"
                required
                value={parcelId}
                onChange={(e) => setParcelId(e.target.value)}
                className="mt-1 w-full border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
              >
                <option value="">Select a parcel…</option>
                {parcelsQuery.data?.map((parcel) => (
                  <option key={parcel.id} value={parcel.id}>
                    {parcel.ulpin} — {parcel.districtName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="officer" className="block text-xs font-medium text-ink-soft">
                Assigned Officer
              </label>
              <input
                id="officer"
                required
                value={assignedOfficer}
                onChange={(e) => setAssignedOfficer(e.target.value)}
                placeholder="Officer name"
                className="mt-1 w-full border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-slate focus:border-navy-500 focus:outline-none"
              />
            </div>

            {error && (
              <p role="alert" className="border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="border border-hairline px-4 py-2 text-sm font-medium text-navy-900 hover:bg-paper-dim"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60"
              >
                {submitting ? "Creating…" : "Create Case"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import type { FormEvent } from "react";
import { MessageSquareWarning, Plus, X } from "lucide-react";
import { DemoTag } from "../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../../components/ui/AsyncState";
import { useApi } from "../../hooks/useApi";
import { apiGet, apiPost, apiPut, ApiRequestError } from "../../services/apiClient";
import type { ApiGrievance, GrievanceStatus } from "../../types/api";
import { useAuth } from "../../features/auth/useAuth";

const OFFICER_ROLES = ["super_admin", "dolr_officer", "state_officer", "district_officer"];

const CATEGORIES = [
  "Compensation",
  "Ownership",
  "Survey",
  "Documentation",
  "Rehabilitation",
  "Consent/Dispute",
  "Other",
] as const;

const STATUS_OPTIONS: GrievanceStatus[] = [
  "open",
  "submitted",
  "under_review",
  "escalated",
  "assigned",
  "resolved",
  "rejected",
];

const STATUS_TONE: Record<GrievanceStatus, string> = {
  open: "bg-info-bg text-info",
  submitted: "bg-info-bg text-info",
  under_review: "bg-warning-bg text-warning",
  escalated: "bg-danger-bg text-danger",
  assigned: "bg-warning-bg text-warning",
  resolved: "bg-success-bg text-success",
  rejected: "bg-danger-bg text-danger",
};

function SubmitGrievanceForm({ onSubmitted, onClose }: { onSubmitted: () => void; onClose: () => void }) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Compensation");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await apiPost<ApiGrievance>("/grievances", { category, description });
      setConfirmation(`Grievance ${created.grievanceNumber} submitted.`);
      setDescription("");
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not submit the grievance.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 px-4">
      <div className="w-full max-w-md border border-hairline bg-white">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="font-display text-lg text-navy-950">Submit Grievance</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        {confirmation ? (
          <div className="space-y-4 px-5 py-6 text-center">
            <p className="text-sm text-success">{confirmation}</p>
            <button
              type="button"
              onClick={onClose}
              className="bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
            <div>
              <label htmlFor="category" className="block text-xs font-medium text-ink-soft">
                Category
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
                className="mt-1 w-full border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="description" className="block text-xs font-medium text-ink-soft">
                Description
              </label>
              <textarea
                id="description"
                required
                minLength={10}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue (at least 10 characters)…"
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
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function GrievancesPage() {
  const { user } = useAuth();
  const isOfficer = user ? OFFICER_ROLES.includes(user.role) : false;
  const [showForm, setShowForm] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const query = useApi(() => apiGet<ApiGrievance[]>("/grievances"), []);

  async function updateStatus(id: string, status: GrievanceStatus) {
    setSavingId(id);
    try {
      await apiPut(`/grievances/${id}`, { status });
      query.refetch();
    } catch {
      // Surfaced implicitly: the row simply won't update, and refetch keeps state in sync.
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-navy-950">
            <MessageSquareWarning className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            Grievances
          </h1>
          <p className="mt-1 text-sm text-ink-soft">Landowner grievances linked to acquisition cases</p>
        </div>
        <div className="flex items-center gap-2">
          <DemoTag label="Live data · demo dataset" />
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-navy-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Submit Grievance
          </button>
        </div>
      </div>

      {query.loading && <LoadingBlock label="Loading grievances…" />}
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
                <th className="px-4 py-3 font-mono font-medium">Grievance ID</th>
                <th className="px-4 py-3 font-medium">Case</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Assigned Officer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {(query.data ?? []).map((g) => (
                <tr key={g.id} className="hover:bg-paper-dim/40">
                  <td className="px-4 py-3 font-mono text-navy-950">{g.grievanceNumber}</td>
                  <td className="px-4 py-3 font-mono text-ink-soft">{g.caseNumber ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">{g.category}</td>
                  <td className="px-4 py-3">
                    {isOfficer ? (
                      <select
                        value={g.status}
                        disabled={savingId === g.id}
                        onChange={(e) => updateStatus(g.id, e.target.value as GrievanceStatus)}
                        className={`border-0 px-2 py-1 text-xs font-medium capitalize disabled:opacity-60 ${STATUS_TONE[g.status]}`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`px-2 py-1 text-xs font-medium capitalize ${STATUS_TONE[g.status]}`}>
                        {g.status.replace("_", " ")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{g.assignedOfficer ?? "Unassigned"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(query.data ?? []).length === 0 && (
            <div className="px-4 py-2">
              <EmptyBlock message="No grievances found. Once a grievance is submitted, it will appear here." />
            </div>
          )}
        </div>
      )}

      {showForm && (
        <SubmitGrievanceForm onClose={() => setShowForm(false)} onSubmitted={() => query.refetch()} />
      )}
    </div>
  );
}

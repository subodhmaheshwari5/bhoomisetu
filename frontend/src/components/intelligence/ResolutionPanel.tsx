import { useState } from "react";
import { ClipboardCheck, Plus, Send, Search, ShieldAlert, Undo2, X, Loader2 } from "lucide-react";
import { PIPELINE_STAGES } from "../../types";
import type { CaseResolution, ResolutionStatus } from "../../types/intelligence";
import type { BottleneckCategory } from "../../types/intelligence";

const STAGE_COUNT = PIPELINE_STAGES.length;

const STATUS_TONE: Record<ResolutionStatus, string> = {
  draft: "bg-neutral-bg text-neutral border-hairline",
  submitted: "bg-info-bg text-info border-info/30",
  under_review: "bg-warning-bg text-warning border-warning/30",
  verified: "bg-success-bg text-success border-success/30",
  rejected: "bg-danger-bg text-danger border-danger/30",
  archived: "bg-neutral-bg text-neutral border-hairline",
};

const PROBLEM_TYPES: { value: BottleneckCategory; label: string }[] = [
  { value: "document_blocker", label: "Document" },
  { value: "approval_blocker", label: "Approval" },
  { value: "compensation_blocker", label: "Compensation" },
  { value: "r_and_r_blocker", label: "R&R" },
  { value: "legal_blocker", label: "Legal" },
  { value: "grievance_blocker", label: "Grievance" },
  { value: "survey_blocker", label: "Survey" },
  { value: "data_quality_blocker", label: "Data Quality" },
  { value: "dependency_blocker", label: "Dependency" },
  { value: "department_handoff_blocker", label: "Department Handoff" },
  { value: "deadline_blocker", label: "Deadline" },
  { value: "ownership_verification_blocker", label: "Ownership Verification" },
  { value: "payment_blocker", label: "Payment" },
  { value: "gis_parcel_blocker", label: "GIS / Parcel" },
];

export interface ResolutionDraft {
  problemType: BottleneckCategory;
  stageNumber: number | null;
  problemDescription: string;
  rootCause: string;
  actionTaken: string;
  responsibleDepartment: string;
  resolution: string;
  outcome: string;
}

interface ResolutionPanelProps {
  resolutions: CaseResolution[];
  currentStage: number;
  suggestedProblemType?: string;
  canRecord: boolean;
  canVerify: boolean;
  currentUserId: string | null;
  onRefresh: () => void;
  onSubmitDraft: (draft: ResolutionDraft) => Promise<void>;
  onTransition: (resolution: CaseResolution, action: "submit" | "start_review" | "verify" | "reject", reason?: string) => Promise<void>;
}

const EMPTY_DRAFT: ResolutionDraft = {
  problemType: "document_blocker",
  stageNumber: null,
  problemDescription: "",
  rootCause: "",
  actionTaken: "",
  responsibleDepartment: "",
  resolution: "",
  outcome: "",
};

/** Mirrors the minimum lengths the backend's createResolutionSchema enforces,
 *  so the Save button explains the problem instead of surfacing a 400. */
function formValid(draft: ResolutionDraft): boolean {
  return (
    draft.problemDescription.trim().length >= 10 &&
    draft.rootCause.trim().length >= 5 &&
    draft.actionTaken.trim().length >= 5 &&
    draft.responsibleDepartment.trim().length >= 1 &&
    draft.resolution.trim().length >= 5 &&
    draft.outcome.trim().length >= 3
  );
}

function Actions({
  r,
  canRecord,
  canVerify,
  currentUserId,
  busy,
  onTransition,
}: {
  r: CaseResolution;
  canRecord: boolean;
  canVerify: boolean;
  currentUserId: string | null;
  busy: boolean;
  onTransition: ResolutionPanelProps["onTransition"];
}) {
  // The backend rejects self-verification too; hiding it avoids a pointless 403.
  const isSelfVerification = r.recordedBy === currentUserId;

  if (r.status === "draft") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onTransition(r, "submit")}
        className="inline-flex items-center gap-1 border border-navy-900 px-2 py-1 text-[10px] font-medium uppercase text-navy-900 hover:bg-navy-50 disabled:opacity-50"
      >
        <Send className="h-3 w-3" /> Submit for verification
      </button>
    );
  }

  if (r.status === "submitted" && canVerify) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onTransition(r, "start_review")}
        className="inline-flex items-center gap-1 border border-navy-900 px-2 py-1 text-[10px] font-medium uppercase text-navy-900 hover:bg-navy-50 disabled:opacity-50"
      >
        <Search className="h-3 w-3" /> Start review
      </button>
    );
  }

  if (r.status === "under_review" && canVerify) {
    if (isSelfVerification) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-slate">
          <ShieldAlert className="h-3 w-3" />
          Another officer must verify this — you recorded it.
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => onTransition(r, "verify")}
          className="inline-flex items-center gap-1 border border-success px-2 py-1 text-[10px] font-medium uppercase text-success hover:bg-success-bg disabled:opacity-50"
        >
          <ClipboardCheck className="h-3 w-3" /> Verify
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const reason = window.prompt("Why is this resolution being rejected?");
            if (reason && reason.trim()) onTransition(r, "reject", reason.trim());
          }}
          className="inline-flex items-center gap-1 border border-danger px-2 py-1 text-[10px] font-medium uppercase text-danger hover:bg-danger-bg disabled:opacity-50"
        >
          <Undo2 className="h-3 w-3" /> Reject
        </button>
      </span>
    );
  }

  if (r.status === "rejected" && canRecord) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onTransition(r, "submit")}
        className="inline-flex items-center gap-1 border border-navy-900 px-2 py-1 text-[10px] font-medium uppercase text-navy-900 hover:bg-navy-50 disabled:opacity-50"
      >
        <Send className="h-3 w-3" /> Resubmit
      </button>
    );
  }

  return null;
}

export function ResolutionPanel({
  resolutions,
  currentStage,
  suggestedProblemType,
  canRecord,
  canVerify,
  currentUserId,
  onRefresh,
  onSubmitDraft,
  onTransition,
}: ResolutionPanelProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ResolutionDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canRecord && !canVerify) return null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSubmitDraft({ ...draft, stageNumber: draft.stageNumber ?? currentStage });
      setDraft(EMPTY_DRAFT);
      setOpen(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the resolution.");
    } finally {
      setBusy(false);
    }
  }

  async function transition(r: CaseResolution, action: "submit" | "start_review" | "verify" | "reject", reason?: string) {
    setBusy(true);
    setError(null);
    try {
      await onTransition(r, action, reason);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the resolution.");
    } finally {
      setBusy(false);
    }
  }

  function beginRecording() {
    setDraft({ ...EMPTY_DRAFT, problemType: (suggestedProblemType as BottleneckCategory) ?? "document_blocker" });
    setOpen(true);
  }

  const field = "w-full border border-hairline bg-white px-2 py-1.5 text-sm text-navy-950 focus:border-navy-700 focus:outline-none";

  return (
    <section className="border border-hairline bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-paper-dim/60 px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-950">
          <ClipboardCheck className="h-4 w-4" />
          Resolution &amp; verification
        </h3>
        {canRecord && !open && (
          <button
            type="button"
            onClick={beginRecording}
            className="inline-flex items-center gap-1 border border-navy-900 px-2.5 py-1 text-[10px] font-medium uppercase text-navy-900 hover:bg-navy-50"
          >
            <Plus className="h-3 w-3" /> Record resolution
          </button>
        )}
      </div>

      <div className="p-4">
        {error && (
          <p role="alert" className="mb-3 border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        {open && (
          <div className="mb-5 border border-navy-300 bg-paper-dim/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-display text-base text-navy-950">Record how this was resolved</h4>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cancel"
                className="grid h-6 w-6 place-items-center border border-hairline text-navy-900 hover:bg-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <p className="mb-3 text-xs text-ink-soft">
              Saved as a draft first. It becomes institutional precedent only after a different senior officer
              verifies it.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[10px] font-medium uppercase tracking-wide text-slate">Problem type</span>
                <select
                  className={field}
                  value={draft.problemType}
                  onChange={(e) => setDraft({ ...draft, problemType: e.target.value as BottleneckCategory })}
                >
                  {PROBLEM_TYPES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-medium uppercase tracking-wide text-slate">Stage</span>
                <select
                  className={field}
                  value={draft.stageNumber ?? currentStage}
                  onChange={(e) => setDraft({ ...draft, stageNumber: Number(e.target.value) })}
                >
                  {Array.from({ length: STAGE_COUNT }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      Stage {n} — {PIPELINE_STAGES[n - 1]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {([
              { key: "problemDescription" as const, label: "What was the problem?", rows: 2, min: 10 },
              { key: "rootCause" as const, label: "Root cause", rows: 2, min: 5 },
              { key: "actionTaken" as const, label: "What action was taken?", rows: 3, min: 5 },
              { key: "resolution" as const, label: "How was it resolved?", rows: 2, min: 5 },
              { key: "outcome" as const, label: "Outcome", rows: 2, min: 3 },
            ]).map((f) => (
              <label key={f.key} className="mt-3 block">
                <span className="text-[10px] font-medium uppercase tracking-wide text-slate">
                  {f.label} <span className="text-danger">*</span>
                </span>
                <textarea
                  className={field}
                  rows={f.rows}
                  value={draft[f.key]}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
                {draft[f.key].trim().length > 0 && draft[f.key].trim().length < f.min && (
                  <span className="text-[10px] text-danger">
                    Needs at least {f.min} characters to be useful as precedent.
                  </span>
                )}
              </label>
            ))}

            <label className="mt-3 block">
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate">
                Responsible department <span className="text-danger">*</span>
              </span>
              <input
                className={field}
                value={draft.responsibleDepartment}
                onChange={(e) => setDraft({ ...draft, responsibleDepartment: e.target.value })}
              />
            </label>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                disabled={busy || !formValid(draft)}
                onClick={save}
                className="inline-flex items-center gap-1.5 border border-navy-900 bg-navy-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-800 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                Save draft
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border border-hairline px-3 py-1.5 text-xs text-navy-900 hover:bg-paper-dim"
              >
                Cancel
              </button>
              {!formValid(draft) && (
                <span className="text-[10px] text-slate">
                  All fields are required — a resolution with no root cause is not reusable.
                </span>
              )}
            </div>
          </div>
        )}

        {resolutions.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No resolutions recorded for this case yet. Recording how a bottleneck was cleared is what lets the next
            officer reuse the fix.
          </p>
        ) : (
          <ul className="space-y-3">
            {resolutions.map((r) => (
              <li key={r.id} className="border border-hairline bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`border px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_TONE[r.status]}`}>
                    {r.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs font-medium text-navy-950">
                    {PROBLEM_TYPES.find((p) => p.value === r.problemType)?.label ?? r.problemType}
                  </span>
                  {r.stageNumber !== null && <span className="text-[10px] text-slate">Stage {r.stageNumber}</span>}
                </div>

                <p className="mt-2 text-xs text-ink-soft">
                  <span className="font-medium text-navy-950">Problem: </span>{r.problemDescription}
                </p>
                {r.rootCause && (
                  <p className="mt-1 text-xs text-ink-soft">
                    <span className="font-medium text-navy-950">Root cause: </span>{r.rootCause}
                  </p>
                )}
                {r.actionTaken && (
                  <p className="mt-1 text-xs text-ink-soft">
                    <span className="font-medium text-navy-950">Action: </span>{r.actionTaken}
                  </p>
                )}
                {r.resolution && (
                  <p className="mt-1 text-xs text-ink-soft">
                    <span className="font-medium text-navy-950">Resolution: </span>{r.resolution}
                  </p>
                )}

                <p className="mt-2 text-[10px] text-slate">
                  Recorded by {r.recordedByName}
                  {r.verifiedByName ? ` · verified by ${r.verifiedByName} on ${r.verifiedAt?.slice(0, 10)}` : ""}
                  {r.responsibleDepartment ? ` · ${r.responsibleDepartment}` : ""}
                </p>

                {r.status === "verified" && (
                  <p className="mt-2 border-l-2 border-success pl-2 text-[10px] text-success">
                    Verified — this resolution is now reusable institutional precedent for similar cases.
                  </p>
                )}
                {r.rejectionReason && (
                  <p className="mt-2 border-l-2 border-danger pl-2 text-[10px] text-danger">
                    Rejected: {r.rejectionReason}
                  </p>
                )}

                <div className="mt-2">
                  <Actions
                    r={r}
                    canRecord={canRecord}
                    canVerify={canVerify}
                    currentUserId={currentUserId}
                    busy={busy}
                    onTransition={transition}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
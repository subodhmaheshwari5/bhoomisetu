import type { CaseStatus, DocumentStatus, RiskLevel, StageStatus } from "../../types";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

// Exhaustive over CaseStatus on purpose: this map is indexed without a
// fallback (`CASE_STATUS_MAP[status].label`), so a status missing here is a
// runtime TypeError that takes down the whole list it appears in, not just
// the badge. Adding a value to the CaseStatus type must add a row here.
const CASE_STATUS_MAP: Record<CaseStatus, { label: string; tone: Tone }> = {
  on_track: { label: "On Track", tone: "success" },
  in_progress: { label: "In Progress", tone: "info" },
  at_risk: { label: "At Risk", tone: "warning" },
  delayed: { label: "Delayed", tone: "danger" },
  completed: { label: "Completed", tone: "info" },
  on_hold: { label: "On Hold", tone: "neutral" },
};

const STAGE_STATUS_MAP: Record<StageStatus, { label: string; tone: Tone }> = {
  not_started: { label: "Not Started", tone: "neutral" },
  in_progress: { label: "In Progress", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  delayed: { label: "Delayed", tone: "danger" },
  blocked: { label: "Blocked", tone: "danger" },
};

const RISK_MAP: Record<RiskLevel, { label: string; tone: Tone }> = {
  low: { label: "Low Risk", tone: "success" },
  medium: { label: "Medium Risk", tone: "warning" },
  high: { label: "High Risk", tone: "danger" },
  critical: { label: "Critical Risk", tone: "danger" },
};

const DOCUMENT_STATUS_MAP: Record<DocumentStatus, { label: string; tone: Tone }> = {
  pending_verification: { label: "Pending Verification", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  uploaded: { label: "Uploaded", tone: "info" },
  under_review: { label: "Under Review", tone: "warning" },
  missing: { label: "Missing", tone: "danger" },
  expired: { label: "Expired", tone: "danger" },
  superseded: { label: "Superseded", tone: "neutral" },
};

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  neutral: "bg-neutral-bg text-neutral",
};

function Chip({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const { label, tone } = CASE_STATUS_MAP[status];
  return <Chip label={label} tone={tone} />;
}

export function StageStatusBadge({ status }: { status: StageStatus }) {
  const { label, tone } = STAGE_STATUS_MAP[status];
  return <Chip label={label} tone={tone} />;
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const { label, tone } = RISK_MAP[risk];
  return <Chip label={label} tone={tone} />;
}

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const { label, tone } = DOCUMENT_STATUS_MAP[status];
  return <Chip label={label} tone={tone} />;
}

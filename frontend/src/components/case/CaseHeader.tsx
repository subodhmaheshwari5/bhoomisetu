import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import type { CaseStatus, RiskLevel } from "../../types";
import { PIPELINE_STAGES } from "../../types";
import type { ApiCase } from "../../types/api";
import { CaseStatusBadge, RiskBadge } from "../ui/StatusBadge";
import { DemoTag } from "../ui/DemoTag";
import { useAuth } from "../../features/auth/useAuth";

const OFFICER_ROLES = ["super_admin", "dolr_officer", "state_officer", "district_officer"];

// Every value the `case_status` enum accepts, so an officer can actually set
// the states the API supports. Omitting `in_progress`/`on_hold` here made
// those cases un-editable: the API accepted them, but no control could
// produce them.
const STATUS_OPTIONS: CaseStatus[] = [
  "on_track",
  "in_progress",
  "at_risk",
  "delayed",
  "completed",
  "on_hold",
];
const RISK_OPTIONS: RiskLevel[] = ["low", "medium", "high", "critical"];

interface CaseHeaderProps {
  acquisitionCase: ApiCase;
  onStatusChange: (status: CaseStatus) => void;
  onRiskChange: (riskLevel: RiskLevel) => void;
  saving?: boolean;
}

export function CaseHeader({ acquisitionCase, onStatusChange, onRiskChange, saving }: CaseHeaderProps) {
  const { user } = useAuth();
  const canEdit = user ? OFFICER_ROLES.includes(user.role) : false;

  return (
    <div>
      <Link
        to="/dashboard/cases"
        className="inline-flex items-center gap-1 text-xs text-ink-soft hover:text-navy-950"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Acquisition Cases
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl text-navy-950">
              Case #{acquisitionCase.caseNumber}
            </h1>
            <DemoTag label="Live data · demo dataset" />
          </div>
          <p className="mt-1 text-sm text-ink-soft">{acquisitionCase.projectName}</p>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={acquisitionCase.status}
              disabled={saving}
              onChange={(e) => onStatusChange(e.target.value as CaseStatus)}
              aria-label="Update case status"
              className="border border-hairline bg-white px-2 py-1 text-xs font-medium text-navy-900 disabled:opacity-60"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status.replace("_", " ")}
                </option>
              ))}
            </select>
            <select
              value={acquisitionCase.riskLevel}
              disabled={saving}
              onChange={(e) => onRiskChange(e.target.value as RiskLevel)}
              aria-label="Update risk level"
              className="border border-hairline bg-white px-2 py-1 text-xs font-medium text-navy-900 disabled:opacity-60"
            >
              {RISK_OPTIONS.map((risk) => (
                <option key={risk} value={risk}>
                  {risk}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <CaseStatusBadge status={acquisitionCase.status} />
            <RiskBadge risk={acquisitionCase.riskLevel} />
          </div>
        )}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 border-y border-hairline py-4 sm:grid-cols-4">
        <div>
          <dt className="font-mono text-[11px] tracking-wide text-slate">District</dt>
          <dd className="mt-0.5 text-sm text-navy-950">{acquisitionCase.districtName}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] tracking-wide text-slate">State</dt>
          <dd className="mt-0.5 text-sm text-navy-950">{acquisitionCase.stateName}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] tracking-wide text-slate">Current Stage</dt>
          <dd className="mt-0.5 text-sm text-navy-950">
            {acquisitionCase.currentStage}. {PIPELINE_STAGES[acquisitionCase.currentStage - 1]}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] tracking-wide text-slate">Assigned Officer</dt>
          <dd className="mt-0.5 text-sm text-navy-950">{acquisitionCase.assignedOfficer}</dd>
        </div>
      </dl>
    </div>
  );
}

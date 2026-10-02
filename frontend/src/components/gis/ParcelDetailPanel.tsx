import { Link } from "react-router-dom";
import { X, FileStack, FolderKanban, History } from "lucide-react";
import type { ReactNode } from "react";
import { PIPELINE_STAGES } from "../../types";
import { caseForParcel } from "../../data/gisData";
import { CaseStatusBadge, RiskBadge } from "../ui/StatusBadge";
import { DemoTag } from "../ui/DemoTag";
import type { ApiCase, ApiParcel } from "../../types/api";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-wide text-slate">{label}</p>
      <p className="mt-0.5 text-sm text-navy-950">{value}</p>
    </div>
  );
}

export function ParcelDetailPanel({
  parcel,
  cases,
  onClose,
}: {
  parcel: ApiParcel;
  cases: ApiCase[];
  onClose: () => void;
}) {
  const linkedCase = caseForParcel(parcel.id, cases);

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto border-l border-hairline bg-white sm:w-96">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <div>
          <p className="font-mono text-xs text-slate">Parcel</p>
          <h2 className="font-display text-lg text-navy-950">{parcel.ulpin}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close parcel details"
          className="grid h-8 w-8 place-items-center border border-hairline text-navy-900 hover:bg-paper-dim"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-6 px-5 py-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="ULPIN" value={<span className="font-mono">{parcel.ulpin}</span>} />
          <Field label="Parcel ID" value={<span className="font-mono">{parcel.id}</span>} />
          <Field label="District" value={parcel.districtName} />
          <Field label="State" value={parcel.stateName} />
          <Field label="Area" value={`${Number(parcel.areaHectares).toFixed(1)} ha`} />
          <Field label="Land Use" value={parcel.landUse} />
          <Field label="Project" value={linkedCase ? linkedCase.projectName : "Not yet assigned"} />
          <Field
            label="Landowner Reference"
            value={<span className="font-mono">{parcel.landownerRef ?? "—"}</span>}
          />
        </div>

        <div className="border-t border-hairline pt-5">
          <p className="mb-3 font-mono text-[11px] tracking-wide text-slate">Acquisition</p>
          {linkedCase ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Case ID" value={<span className="font-mono">{linkedCase.caseNumber}</span>} />
                <Field label="Last Updated" value={linkedCase.updatedAt.slice(0, 10)} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CaseStatusBadge status={linkedCase.status} />
                <RiskBadge risk={linkedCase.riskLevel} />
              </div>
              <Field
                label="Current Stage"
                value={`${linkedCase.currentStage}. ${PIPELINE_STAGES[linkedCase.currentStage - 1]}`}
              />
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              This parcel is not yet linked to an active acquisition case.
            </p>
          )}
        </div>

        <DemoTag label="Live data · demo dataset" />
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline px-5 py-4">
        <Link
          to={linkedCase ? `/dashboard/cases/${linkedCase.id}` : "/dashboard/cases"}
          className="flex items-center justify-center gap-2 bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800"
        >
          <FileStack className="h-4 w-4" strokeWidth={1.75} />
          View Case
        </Link>
        <div className="grid grid-cols-2 gap-2">
          {linkedCase ? (
            <>
              <Link
                to={`/dashboard/cases/${linkedCase.id}#documents`}
                className="flex items-center justify-center gap-2 border border-hairline px-4 py-2 text-xs font-medium text-navy-900 hover:bg-paper-dim"
              >
                <FolderKanban className="h-3.5 w-3.5" strokeWidth={1.75} />
                Documents
              </Link>
              <Link
                to={`/dashboard/cases/${linkedCase.id}#timeline`}
                className="flex items-center justify-center gap-2 border border-hairline px-4 py-2 text-xs font-medium text-navy-900 hover:bg-paper-dim"
              >
                <History className="h-3.5 w-3.5" strokeWidth={1.75} />
                Timeline
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled
                title="No case linked to this parcel yet"
                className="flex cursor-not-allowed items-center justify-center gap-2 border border-hairline px-4 py-2 text-xs font-medium text-slate opacity-60"
              >
                <FolderKanban className="h-3.5 w-3.5" strokeWidth={1.75} />
                Documents
              </button>
              <button
                type="button"
                disabled
                title="No case linked to this parcel yet"
                className="flex cursor-not-allowed items-center justify-center gap-2 border border-hairline px-4 py-2 text-xs font-medium text-slate opacity-60"
              >
                <History className="h-3.5 w-3.5" strokeWidth={1.75} />
                Timeline
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { ChevronDown, ListChecks } from "lucide-react";
import type { ApiStage } from "../../types/api";
import { StageStatusBadge } from "../ui/StatusBadge";

function StageRow({ stage, defaultOpen }: { stage: ApiStage; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const isNotStarted = stage.status === "not_started";

  return (
    <li className="border-b border-hairline last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-paper-dim/60"
        aria-expanded={open}
      >
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-xs ${
            isNotStarted ? "bg-neutral-bg text-neutral" : "bg-navy-900 text-white"
          }`}
        >
          {stage.stageNumber}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm ${isNotStarted ? "text-ink-soft" : "font-medium text-navy-950"}`}>
            {stage.stageName}
          </span>
        </span>
        <StageStatusBadge status={stage.status} />
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="grid grid-cols-2 gap-4 px-5 pb-5 pl-16 sm:grid-cols-4">
          <div>
            <p className="font-mono text-[11px] tracking-wide text-slate">Start Date</p>
            <p className="mt-0.5 text-sm text-navy-950">{stage.startDate ?? "—"}</p>
          </div>
          <div>
            <p className="font-mono text-[11px] tracking-wide text-slate">Completion Date</p>
            <p className="mt-0.5 text-sm text-navy-950">{stage.completionDate ?? "—"}</p>
          </div>
          <div>
            <p className="font-mono text-[11px] tracking-wide text-slate">Responsible Department</p>
            <p className="mt-0.5 text-sm text-navy-950">{stage.responsibleDepartment}</p>
          </div>
          <div>
            <p className="font-mono text-[11px] tracking-wide text-slate">Responsible Officer</p>
            <p className="mt-0.5 text-sm text-navy-950">{stage.responsibleOfficer}</p>
          </div>
          {stage.remarks && (
            <div className="col-span-2 sm:col-span-4">
              <p className="font-mono text-[11px] tracking-wide text-slate">Remarks</p>
              <p className="mt-0.5 text-sm text-ink-soft">
                {stage.remarks}
                {stage.delayDays !== undefined && (
                  <span className="ml-2 font-medium text-danger">· {stage.delayDays} days overdue</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function StageWorkflow({ stages }: { stages: ApiStage[] }) {
  const currentStageNumber = stages.find((s) => s.status === "in_progress" || s.status === "delayed")?.stageNumber;

  return (
    <section className="border border-hairline bg-white" aria-labelledby="stage-workflow-heading">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h2 id="stage-workflow-heading" className="flex items-center gap-2 font-display text-lg text-navy-950">
          <ListChecks className="h-4 w-4 text-navy-700" strokeWidth={1.75} aria-hidden="true" />
          10-Stage Acquisition Pipeline
        </h2>
      </div>
      <ol>
        {stages.map((stage) => (
          <StageRow key={stage.stageNumber} stage={stage} defaultOpen={stage.stageNumber === currentStageNumber} />
        ))}
      </ol>
    </section>
  );
}

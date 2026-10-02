import { useState } from "react";
import type { ReactNode } from "react";
import { Search, ShieldCheck, GitBranch, ListChecks, History, X, ChevronRight, ChevronDown, Clock } from "lucide-react";
import type { CaseIntelligence, Bottleneck, EvidenceItem } from "../../types/intelligence";

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-danger-bg text-danger border-danger/30",
  high: "bg-warning-bg text-warning border-warning/30",
  medium: "bg-info-bg text-info border-info/30",
  low: "bg-neutral-bg text-neutral border-hairline",
};

const BLOCKER_LABEL: Record<string, string> = {
  document_blocker: "Document",
  approval_blocker: "Approval",
  compensation_blocker: "Compensation",
  r_and_r_blocker: "R&R",
  legal_blocker: "Legal",
  grievance_blocker: "Grievance",
  survey_blocker: "Survey",
  data_quality_blocker: "Data Quality",
  dependency_blocker: "Dependency",
  department_handoff_blocker: "Department Handoff",
  deadline_blocker: "Deadline",
  ownership_verification_blocker: "Ownership Verification",
  payment_blocker: "Payment",
  gis_parcel_blocker: "GIS / Parcel",
  unknown_blocker: "Unknown",
};

function severityTone(severity: string) {
  return SEVERITY_TONE[severity] ?? SEVERITY_TONE.low;
}

function Section({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="border border-hairline bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-hairline bg-paper-dim/60 px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-950">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Collapsible evidence list, keyed by the E-ids a conclusion cites. */
function EvidenceRefs({
  ids,
  evidence,
  onInspect,
}: {
  ids: string[];
  evidence: EvidenceItem[];
  onInspect: (item: EvidenceItem) => void;
}) {
  if (ids.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate">Evidence</span>
      {ids.map((id) => {
        const item = evidence.find((e) => e.id === id);
        if (!item) return null;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onInspect(item)}
            className="inline-flex items-center gap-1 border border-hairline bg-white px-1.5 py-0.5 font-mono text-[10px] text-navy-700 hover:border-navy-500 hover:bg-paper-dim"
            title={item.supports}
          >
            {id}
          </button>
        );
      })}
    </div>
  );
}

function BlockerCard({
  blocker,
  evidence,
  onInspect,
  heading,
}: {
  blocker: Bottleneck;
  evidence: EvidenceItem[];
  onInspect: (item: EvidenceItem) => void;
  heading: string;
}) {
  return (
    <div className="border border-hairline bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate">{heading}</span>
        <span className={`border px-2 py-0.5 text-[10px] font-semibold uppercase ${severityTone(blocker.severity)}`}>
          {blocker.severity}
        </span>
        <span className="border border-hairline bg-paper-dim px-2 py-0.5 text-[10px] font-medium uppercase text-navy-700">
          {BLOCKER_LABEL[blocker.type] ?? blocker.type}
        </span>
        <span
          className="text-[10px] text-slate"
          title="How strongly the available evidence supports this classification, not model confidence."
        >
          Evidence strength: {blocker.confidence}
        </span>
      </div>
      <p className="mt-2 font-display text-base text-navy-950">{blocker.title}</p>
      <p className="mt-1 text-sm text-ink-soft">{blocker.detail}</p>
      <EvidenceRefs ids={blocker.evidenceIds} evidence={evidence} onInspect={onInspect} />
    </div>
  );
}

export function IntelligencePanel({ analysis }: { analysis: CaseIntelligence }) {
  const [inspected, setInspected] = useState<EvidenceItem | null>(null);
  const [openFactor, setOpenFactor] = useState<number | null>(null);

  const evidenceById = new Map(analysis.evidence.map((e) => [e.id, e]));

  // Older cached payloads predate this distinction; treat a missing list as empty
  // rather than failing to render.
  const activeDependencies = (analysis.activeDependencies ?? []).filter((d) => !d.blocking);

  return (
    <div className="space-y-4">
      {/* Headline ------------------------------------------------------- */}
      <div className="border-2 border-navy-900 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-navy-50 px-4 py-2.5">
          <h2 className="flex items-center gap-2 font-display text-lg text-navy-950">
            <Search className="h-4 w-4" strokeWidth={1.75} />
            Acquisition Intelligence
          </h2>
          <span className="font-mono text-[10px] text-slate">{analysis.analysisVersion}</span>
        </div>

<div className="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-5">
          {[
            { label: "Case", value: analysis.caseNumber },
            { label: "Status", value: analysis.status.replace(/_/g, " ") },
            {
              label: "Computed Risk",
              value: analysis.risk.score === null ? analysis.risk.level : `${analysis.risk.level} (${analysis.risk.score})`,
            },
            // Computed: how long the case as a whole has gone without advancing.
            {
              label: "Stuck For",
              title: "Days since the last recorded progress on this case, computed from evidence.",
              value: `${analysis.delayImpact.delayDays} day${analysis.delayImpact.delayDays === 1 ? "" : "s"}`,
            },
            // Recorded: the workflow's own delay figure for the current stage.
            {
              label: "Stage Delay (recorded)",
              title: "Delay recorded against the current workflow stage by the officer handling it.",
              value: `${analysis.delayImpact.recordedStageDelayDays} day${analysis.delayImpact.recordedStageDelayDays === 1 ? "" : "s"}`,
            },
          ].map((cell) => (
            <div key={cell.label} className="bg-white px-4 py-3" title={cell.title}>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate">{cell.label}</p>
              <p className="mt-0.5 font-display text-base text-navy-950">{cell.value}</p>
            </div>
          ))}
        </div>

        <p className="px-4 py-3 text-sm leading-relaxed text-ink">{analysis.summary}</p>
      </div>

      {/* Primary blocker ------------------------------------------------ */}
      <Section icon={<ShieldCheck className="h-4 w-4" />} title="Why is this case stuck?">
        {analysis.primaryBlocker ? (
          <BlockerCard
            blocker={analysis.primaryBlocker}
            evidence={analysis.evidence}
            onInspect={setInspected}
            heading="Primary blocker"
          />
        ) : (
          <p className="text-sm text-ink-soft">
            No bottleneck detected. Every stage, document, approval, compensation record, and grievance on this
            case is currently in a complete state.
          </p>
        )}
      </Section>

      {/* Active dependencies -------------------------------------------- */}
      {/*
        Only non-blocking entries are shown here. A dependency that IS blocking
        already appears as a blocker above, so repeating it would imply it is an
        additional, separate problem. The point of this section is the opposite
        signal: work that is genuinely under way and is NOT why the case is stuck.
      */}
      {activeDependencies.length > 0 && (
        <Section
          icon={<Clock className="h-4 w-4" />}
          title={`In progress, not blocking (${activeDependencies.length})`}
        >
          <p className="mb-3 text-xs text-ink-soft">
            These obligations are under way. No evidence shows they are delaying this case, so they are reported
            separately rather than counted as bottlenecks.
          </p>
          <ul className="space-y-2">
            {activeDependencies.map((dep, i) => (
              <li key={`${dep.category}-${i}`} className="border border-hairline bg-white px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="border border-info/30 bg-info-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-info">
                    {dep.classification === "blocker" ? dep.severity : "in progress"}
                  </span>
                  <span className="text-sm font-medium text-navy-950">{dep.title}</span>
                </div>
                <p className="mt-1.5 text-xs text-ink-soft">{dep.reason}</p>
                <EvidenceRefs ids={dep.evidenceIds} evidence={analysis.evidence} onInspect={setInspected} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Contributing factors ------------------------------------------- */}
      {analysis.contributingFactors.length > 0 && (
        <Section icon={<ListChecks className="h-4 w-4" />} title={`Contributing factors (${analysis.contributingFactors.length})`}>
          <p className="mb-3 text-xs text-ink-soft">
            These compound the primary blocker but are not the main cause. They are listed separately so
            accountability is not misattributed to a single item.
          </p>
          <ul className="space-y-2">
            {analysis.contributingFactors.map((f, i) => (
              <li key={`${f.type}-${i}`}>
                <button
                  type="button"
                  onClick={() => setOpenFactor(openFactor === i ? null : i)}
                  className="flex w-full items-start justify-between gap-3 border border-hairline bg-white px-3 py-2 text-left hover:bg-paper-dim"
                  aria-expanded={openFactor === i}
                >
                  <span className="flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${severityTone(f.severity)}`}>
                        {f.severity}
                      </span>
                      <span className="text-sm font-medium text-navy-950">{f.title}</span>
                    </span>
                    {openFactor === i && (
                      <>
                        <span className="mt-1.5 block text-xs text-ink-soft">{f.detail}</span>
                        <EvidenceRefs ids={f.evidenceIds} evidence={analysis.evidence} onInspect={setInspected} />
                      </>
                    )}
                  </span>
                  {openFactor === i ? (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Evidence ------------------------------------------------------- */}
      <Section
        icon={<ListChecks className="h-4 w-4" />}
        title={`Evidence (${analysis.evidence.length})`}
        action={
          <span className="text-[10px] text-slate">
            Each row is a record in BhoomiSetu, not an AI assertion
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-hairline text-[10px] uppercase tracking-wide text-slate">
                <th className="py-1.5 pr-3 font-medium">Ref</th>
                <th className="py-1.5 pr-3 font-medium">Source field</th>
                <th className="py-1.5 pr-3 font-medium">Observed</th>
                <th className="py-1.5 font-medium">What it supports</th>
              </tr>
            </thead>
            <tbody>
              {analysis.evidence.map((e) => (
                <tr key={e.id} className="border-b border-hairline/60 align-top">
                  <td className="py-1.5 pr-3 font-mono text-[10px] text-navy-700">{e.id}</td>
                  <td className="py-1.5 pr-3 font-mono text-[10px] text-ink-soft">
                    {e.source}.{e.field}
                  </td>
                  <td className="py-1.5 pr-3 text-navy-950">{e.observed}</td>
                  <td className="py-1.5 text-ink-soft">{e.supports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Dependency chain ---------------------------------------------- */}
      {analysis.dependencyChain.length > 0 && (
        <Section icon={<GitBranch className="h-4 w-4" />} title="Delay dependency chain">
          <p className="mb-3 text-xs text-ink-soft">
            How the blockage propagates through the acquisition lifecycle. Stages below the blocker cannot start
            until it clears.
          </p>
          <ol className="space-y-1">
            {analysis.dependencyChain.map((node) => (
              <li key={node.stageNumber} className="flex items-center gap-3">
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center border text-[10px] font-semibold ${
                    node.isPrimary
                      ? "border-danger bg-danger-bg text-danger"
                      : "border-hairline bg-paper-dim text-navy-700"
                  }`}
                >
                  {node.stageNumber}
                </span>
                <span className="flex-1 text-sm text-navy-950">
                  {node.stageName}
                  {node.isPrimary && (
                    <span className="ml-2 text-[10px] font-semibold uppercase text-danger">Current blocker</span>
                  )}
                </span>
                <span className="text-[10px] uppercase text-slate">{node.status.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Risk ----------------------------------------------------------- */}
      <Section icon={<ShieldCheck className="h-4 w-4" />} title="Risk assessment">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`border px-2.5 py-1 text-xs font-semibold uppercase ${severityTone(analysis.risk.level)}`}>
            {analysis.risk.level}
          </span>
          {analysis.risk.score !== null && (
            <span className="font-mono text-sm text-navy-950">{analysis.risk.score}/100</span>
          )}
          <span className="text-[10px] text-slate">
            {analysis.risk.source === "computed"
              ? "From the existing deterministic risk engine"
              : "Officer-set case field (engine not yet run)"}
          </span>
        </div>

        {analysis.riskDisagreement && (
          <div className="mt-3 border border-warning/30 bg-warning-bg px-3 py-2">
            <p className="text-xs font-medium text-warning">Risk records disagree</p>
            <p className="mt-1 text-xs text-ink-soft">{analysis.riskDisagreement.note}</p>
            <p className="mt-1 font-mono text-[10px] text-ink-soft">
              case field = {analysis.riskDisagreement.caseFieldLevel} · computed ={" "}
              {analysis.riskDisagreement.computedLevel} ({analysis.riskDisagreement.computedScore})
            </p>
          </div>
        )}

        {analysis.risk.reasons.length > 0 && (
          <ul className="mt-3 space-y-1">
            {analysis.risk.reasons.map((r) => (
              <li key={r} className="flex gap-2 text-xs text-ink">
                <span aria-hidden="true" className="text-slate">—</span>
                {r}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Recommendations ------------------------------------------------ */}
      {analysis.recommendations.length > 0 && (
        <Section icon={<ListChecks className="h-4 w-4" />} title="Recommended next actions">
          <ol className="space-y-3">
            {analysis.recommendations.map((r, i) => (
              <li key={`${r.action}-${i}`} className="border-l-2 border-navy-300 pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-slate">{i + 1}</span>
                  <span className="text-sm font-medium text-navy-950">{r.action}</span>
                  <span
                    className={`border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${severityTone(
                      r.priority === "high" ? "high" : r.priority === "medium" ? "medium" : "low",
                    )}`}
                  >
                    {r.priority}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">{r.reason}</p>
                <p className="mt-1 text-[10px] text-slate">
                  Owner: {r.responsibleRole}
                  {r.dependency ? ` · Depends on: ${r.dependency}` : ""}
                </p>
                <EvidenceRefs ids={r.evidenceIds} evidence={analysis.evidence} onInspect={setInspected} />
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Precedents ------------------------------------------------------ */}
      <Section icon={<History className="h-4 w-4" />} title="Similar verified cases">
        {analysis.similarCases && analysis.similarCases.length > 0 ? (
          <>
            <p className="mb-3 text-xs text-ink-soft">
              Verified historical resolutions. These are institutional knowledge — they may be relevant, but the
              decision remains yours.
            </p>
            <ul className="space-y-3">
              {analysis.similarCases.map((s) => (
                <li key={s.resolutionId} className="border border-hairline bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-navy-950">{s.sourceCaseNumber}</span>
                    <span className="border border-hairline bg-paper-dim px-1.5 py-0.5 text-[10px] font-medium uppercase text-navy-700">
                      {BLOCKER_LABEL[s.problemType] ?? s.problemType}
                    </span>
                    <span className="text-[10px] text-slate">
                      Match: {s.match.level}
                      {s.match.matchedOn.length > 0 ? ` (${s.match.matchedOn.join(", ")})` : ""}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-soft">
                    <span className="font-medium text-navy-950">Problem: </span>
                    {s.problemDescription}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    <span className="font-medium text-navy-950">Resolution: </span>
                    {s.resolution}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    <span className="font-medium text-navy-950">Outcome: </span>
                    {s.outcome}
                  </p>
                  <p className="mt-1 text-[10px] text-slate">
                    {s.responsibleDepartment} · resolved {s.resolutionDate} · verified by {s.verifiedByName}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            No verified precedent matches this case yet. Once a similar case is resolved and verified by a senior
            officer, it will appear here.
          </p>
        )}
      </Section>

      {/* Data completeness + disclaimer ---------------------------------- */}
      {!analysis.dataCompleteness.isComplete && (
        <div className="border border-hairline bg-paper-dim px-4 py-3">
          <p className="text-xs font-medium text-navy-950">Incomplete case data</p>
          <p className="mt-1 text-xs text-ink-soft">
            The following are missing and may limit this analysis:{" "}
            {analysis.dataCompleteness.missingSections.join(", ")}.
          </p>
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-slate">{analysis.disclaimer}</p>

      {/* Evidence inspector --------------------------------------------- */}
      {inspected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Evidence detail"
          onClick={() => setInspected(null)}
        >
          <div
            className="w-full max-w-lg border border-hairline bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-navy-700">{inspected.id}</p>
                <p className="font-display text-base text-navy-950">
                  {inspected.source}.{inspected.field}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspected(null)}
                className="grid h-7 w-7 place-items-center border border-hairline text-navy-900 hover:bg-paper-dim"
                aria-label="Close evidence detail"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wide text-slate">Observed value</dt>
                <dd className="mt-0.5 text-navy-950">{inspected.observed}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wide text-slate">What this supports</dt>
                <dd className="mt-0.5 text-ink-soft">{inspected.supports}</dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-hairline pt-3 text-[10px] text-slate">
              {evidenceById.size} evidence item{evidenceById.size === 1 ? "" : "s"} were recorded for this analysis.
              Each is a value read directly from the BhoomiSetu database, not generated text.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

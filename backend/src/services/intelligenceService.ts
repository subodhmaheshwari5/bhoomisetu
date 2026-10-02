/**
 * Acquisition Intelligence Engine — deterministic bottleneck detection.
 *
 * This module is the analytical core of "Why is this case stuck?". It is
 * PURELY DETERMINISTIC: it reads authoritative tables and applies explicit
 * rules. No LLM is involved in detecting a blocker, ranking it, or building the
 * evidence list. That separation is the whole point — a model can explain the
 * output, but it can never author it.
 *
 * Design rules enforced here:
 *   1. Every blocker carries the evidence IDs that justify it.
 *   2. Every statement traces to a real row via a source reference.
 *   3. Nothing is inferred that the data does not support. If a field is
 *      missing, the engine says so rather than guessing.
 *   4. Authority is described by ROLE/DEPARTMENT, never by blaming a named
 *      individual, unless the data itself records a rejection by a named user.
 */

import { pool } from "../config/db.js";
import { camelCaseKeys, camelCaseRows } from "../utils/rowMapper.js";
import { computeRiskScore } from "./riskEngineService.js";
import { PIPELINE_STAGES } from "../types/index.js";
import type {
  ActiveDependency,
  BottleneckCategory,
  BottleneckConfidence,
  BottleneckSeverity,
  CaseIntelligence,
  EvidenceItem,
  IntelligenceRecommendation,
} from "../types/intelligence.js";

/**
 * Bump when detection rules change so a stored analysis can be reproduced.
 * Recorded on every resolution and audit row.
 */
export const ANALYSIS_VERSION = "BHOOMI_INTELLIGENCE_V1";

/** Stage that cannot start until the current one completes. Derived from PIPELINE_STAGES. */
function stageName(n: number): string {
  return PIPELINE_STAGES[n - 1] ?? `Stage ${n}`;
}

/**
 * Stages that are structurally gated by another stage's outcome. Used to build
 * the delay dependency chain. The acquisition pipeline is strictly sequential,
 * so anything after the blocked stage is downstream impact.
 */
function downstreamStages(from: number): number[] {
  const out: number[] = [];
  for (let n = from + 1; n <= PIPELINE_STAGES.length; n++) out.push(n);
  return out;
}

// ---------------------------------------------------------------------------
// Context loading
// ---------------------------------------------------------------------------

const CASE_SELECT = `
  SELECT c.id, c.case_number, c.project_id, c.parcel_id, c.district_id,
         c.current_stage, c.status, c.risk_level, c.assigned_officer,
         c.created_at, c.updated_at,
         p.name AS project_name, p.agency AS project_agency,
         d.name AS district_name, d.state_name,
         lp.ulpin, lp.area_hectares, lp.land_use,
         lo.landowner_ref, lo.name AS landowner_name
  FROM acquisition_cases c
  JOIN projects p ON p.id = c.project_id
  JOIN districts d ON d.id = c.district_id
  JOIN land_parcels lp ON lp.id = c.parcel_id
  LEFT JOIN landowners lo ON lo.id = lp.landowner_id
`;

export interface CaseContext {
  caseRow: Record<string, unknown> | null;
  stages: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  compensation: Record<string, unknown> | null;
  rehabilitation: Record<string, unknown> | null;
  grievances: Array<Record<string, unknown>>;
  risk: Record<string, unknown> | null;
  /** Work items assigned to the Rehabilitation & Resettlement department. */
  rrTasks: Array<Record<string, unknown>>;
}

export async function loadCaseContext(caseId: string): Promise<CaseContext | null> {
  const [caseRes, stagesRes, docsRes, compRes, rrRes, grieRes, riskRes, rrTaskRes] = await Promise.all([
    pool.query(`${CASE_SELECT} WHERE c.id = $1`, [caseId]),
    pool.query(
      `SELECT id, stage_number, stage_name, status, start_date, completion_date, due_date,
              responsible_department, responsible_officer, remarks, delay_days
       FROM acquisition_stages WHERE case_id = $1 ORDER BY stage_number`,
      [caseId],
    ),
    pool.query(
      `SELECT id, document_type, file_name, storage_path, uploaded_by, verification_status, created_at
       FROM documents WHERE case_id = $1 ORDER BY created_at`,
      [caseId],
    ),
    pool.query(
      `SELECT id, assessment_amount, approval_status, disbursement_status, payment_date,
              payment_reference, updated_at
       FROM compensation WHERE case_id = $1
       ORDER BY is_primary DESC LIMIT 1`,
      [caseId],
    ),
    pool.query(
      `SELECT id, status, details, created_at, target_date, updated_at, eligibility, entitlement
       FROM rehabilitation WHERE case_id = $1`,
      [caseId],
    ),
    pool.query(
      `SELECT id, grievance_number, category, description, status, assigned_officer, resolution, created_at
       FROM grievances WHERE case_id = $1 ORDER BY created_at DESC`,
      [caseId],
    ),
    pool.query(
      `SELECT id, score, level, reasons, recommendation, computed_at
       FROM risk_scores WHERE case_id = $1`,
      [caseId],
    ),
    // R&R work items. Used to decide whether an in-progress R&R record is
    // actually holding the case up, rather than assuming it is.
    pool.query(
      `SELECT id, task_ref, title, department, priority, status, due_date, completed_at
       FROM tasks
       WHERE case_id = $1 AND department = $2
       ORDER BY due_date NULLS LAST`,
      [caseId, RR_DEPARTMENT],
    ),
  ]);

  const caseRow = caseRes.rows[0];
  if (!caseRow) return null;

  return {
    caseRow: camelCaseKeys(caseRow),
    stages: camelCaseRows(stagesRes.rows),
    documents: camelCaseRows(docsRes.rows),
    compensation: camelCaseKeys(compRes.rows[0]),
    rehabilitation: selectMostOutstandingRAndR(camelCaseRows(rrRes.rows)),
    grievances: camelCaseRows(grieRes.rows),
    risk: camelCaseKeys(riskRes.rows[0]),
    rrTasks: camelCaseRows(rrTaskRes.rows),
  };
}

// ---------------------------------------------------------------------------
// Evidence engine
// ---------------------------------------------------------------------------

class EvidenceCollector {
  private items: EvidenceItem[] = [];

  /**
   * Records one piece of evidence. `source` points at the real row so a UI can
   * drill into it; `field` names the exact column so a reviewer can verify the
   * claim without trusting the prose.
   */
  add(
    source: EvidenceItem["source"],
    field: string,
    observed: string,
    supports: string,
  ): EvidenceItem {
    const item: EvidenceItem = {
      id: `E${this.items.length + 1}`,
      source,
      field,
      observed,
      supports,
    };
    this.items.push(item);
    return item;
  }

  list(): EvidenceItem[] {
    return this.items;
  }
}

// ---------------------------------------------------------------------------
// Bottleneck detection rules
// ---------------------------------------------------------------------------

interface BlockerDraft {
  type: BottleneckCategory;
  title: string;
  detail: string;
  severity: BottleneckSeverity;
  confidence: BottleneckConfidence;
  delayContributionDays: number;
  affectedStages: number[];
  evidence: EvidenceItem[];
  recommendations: IntelligenceRecommendation[];
}

const APPROVAL_SLA_DAYS = 7;
const PAYMENT_SLA_DAYS = 15;
const GRIEVANCE_SLA_DAYS = 30;

/**
 * Whole days between two instants.
 *
 * Truncated toward zero rather than rounded, deliberately:
 *   - A stage due 18 days and 20 hours ago is 18 days overdue. Rounding would
 *     report 19, which then contradicts the `delay_days` recorded on the stage
 *     and makes the two records disagree for no real reason.
 *   - Rounding also makes the answer depend on the time of day the report is
 *     generated, so the same unchanged case would show different delays
 *     depending on when it was opened.
 * Toward zero (not floor) so a future date yields the smaller magnitude, e.g.
 * "due in 3 days" rather than "due in 4".
 */
function daysBetween(a: Date, b: Date): number {
  return Math.trunc((a.getTime() - b.getTime()) / 86_400_000);
}

/**
 * Safely coerce a DB date/timestamp column to a Date anchored at UTC midnight.
 *
 * Two distinct hazards are handled here.
 *
 * 1. A bare `YYYY-MM-DD` value is anchored to UTC midnight, NOT local midnight.
 *    `new Date("2026-09-02")` parses as local midnight, which in any timezone east
 *    of UTC moves the instant into the previous day and inflates every elapsed-day
 *    count computed from it by up to one. Anchoring to UTC keeps day arithmetic
 *    timezone-independent, so a case does not report a different delay depending on
 *    where the reporting officer is sitting.
 *
 * 2. `pg` returns a DATE column as a JS Date built from the LOCAL date parts. In
 *    IST (UTC+05:30) the date 2026-09-13 arrives as the instant 2026-09-12T18:30Z,
 *    i.e. it *looks* like the previous day in UTC. Passing that instant straight
 *    into `daysBetween` counted the flagship's 18-day overdue stage as 19.
 *    Re-anchoring the LOCAL calendar date to UTC midnight makes every day count a
 *    true calendar difference and agrees with `isoDay`, which reads local parts.
 */
function asDate(value: unknown): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // Recover the calendar date `pg` encoded, then pin it to UTC midnight.
    return new Date(
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
    );
  }

  const raw = String(value);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const d = dateOnly ? new Date(`${raw}T00:00:00.000Z`) : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ISO day string for evidence display, or "not recorded".
 *
 * Formats using LOCAL date parts on purpose. Postgres returns a DATE column as
 * a JS Date at local midnight, so toISOString() would shift it back a day in any
 * timezone east of UTC — producing two different dates for the same record.
 */
function isoDay(value: unknown): string {
  const d = asDate(value);
  if (!d) return "not recorded";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Department responsible for rehabilitation and resettlement work items. */
const RR_DEPARTMENT = "Rehabilitation & Resettlement Department";

/**
 * How outstanding each R&R status is. Higher means further from completion.
 *
 * Used to pick which record represents a case when it has several parcels, each
 * with its own R&R row.
 */
const RR_OUTSTANDING_RANK: Record<string, number> = {
  not_started: 10,
  disputed: 9,
  in_progress: 8,
  eligibility_pending: 7,
  entitlement_pending: 6,
  assistance_pending: 5,
  resettlement_pending: 4,
  eligible: 3,
  entitlement_approved: 2,
  assistance_provided: 1,
  resettled: 0,
  completed: -1,
};

/**
 * Selects the R&R record that represents the case as a whole.
 *
 * A multi-parcel case has one R&R row per affected parcel, so taking whichever
 * row the database happened to return first made the analysis depend on
 * unspecified row order — unacceptable for an engine whose entire premise is
 * determinism. The most outstanding record is the one that matters, since it is
 * the obligation still holding the case up; ties break on id so the choice is
 * stable across runs.
 */
function selectMostOutstandingRAndR(
  rows: Array<Record<string, unknown>>,
): Record<string, unknown> | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, row) => {
    const bestRank = RR_OUTSTANDING_RANK[String(best.status ?? "")] ?? 0;
    const rank = RR_OUTSTANDING_RANK[String(row.status ?? "")] ?? 0;
    if (rank !== bestRank) return rank > bestRank ? row : best;
    return String(row.id ?? "") < String(best.id ?? "") ? row : best;
  });
}

/**
 * R&R statuses that mean the process is under way rather than finished or
 * untouched.
 *
 * Only `in_progress` is ambiguous on its own: it asserts that work has started,
 * which is NOT the same claim as "this is stopping the case". Every other
 * non-completed status either represents an unresolved dispute or a position
 * where nothing has begun, so it keeps the pre-existing blocker treatment.
 */
const RR_ACTIVE_STATUSES = new Set(["in_progress"]);

export interface BottleneckScan {
  blockers: BlockerDraft[];
  /** Live obligations that are not necessarily blocking. Never ranked. */
  activeDependencies: ActiveDependency[];
}

/**
 * Decides whether an in-progress R&R record is actually preventing progress.
 *
 * Each condition below is grounded in data the project already records. No
 * threshold is invented here: where a standard exists it comes from an existing
 * column (an R&R task's own due date, the record's target date) rather than a
 * constant chosen for this rule.
 */
function assessInProgressRAndR(
  ctx: CaseContext,
  currentStage: number,
  evidence: EvidenceCollector,
): { blocking: boolean; reasons: string[]; blockingEvidence: EvidenceItem[] } {
  const rr = ctx.rehabilitation as Record<string, unknown>;
  const now = new Date();
  const reasons: string[] = [];
  const blockingEvidence: EvidenceItem[] = [];
  let blocking = false;

  // Context rows are camelCased by the row mapper, so these are camelCase keys.
  // 1. The R&R deadline itself has passed.
  const targetDate = asDate(rr.targetDate);
  if (targetDate) {
    const overdueDays = daysBetween(now, targetDate);
    if (overdueDays > 0) {
      blocking = true;
      reasons.push(
        `The R&R target date of ${isoDay(rr.targetDate)} passed ${overdueDays} day${overdueDays === 1 ? "" : "s"} ago.`,
      );
      blockingEvidence.push(
        evidence.add(
          "rehabilitation",
          "target_date",
          isoDay(rr.targetDate),
          "R&R target date has passed",
        ),
      );
    }
  }

  // 2 & 4. An R&R work item is explicitly overdue, or is incomplete past its own
  // due date. The due date IS the SLA for the action, so no constant is needed.
  for (const task of ctx.rrTasks) {
    const taskStatus = String(task.status ?? "");
    const isComplete = taskStatus === "completed" || task.completedAt != null;
    if (isComplete) continue;

    const explicitlyOverdue = taskStatus === "overdue";
    const dueDate = asDate(task.dueDate);
    const pastDue = dueDate ? daysBetween(now, dueDate) : null;
    const breachedByDate = pastDue !== null && pastDue > 0;

    if (explicitlyOverdue || breachedByDate) {
      blocking = true;
      const detail = explicitlyOverdue
        ? `is marked overdue`
        : `was due ${isoDay(task.dueDate)}`;
      reasons.push(`R&R work item "${String(task.title)}" (${String(task.taskRef)}) ${detail}.`);
      blockingEvidence.push(
        evidence.add(
          "task",
          "status",
          `${String(task.taskRef)}: ${taskStatus}`,
          "R&R work item is overdue",
        ),
      );
    }
  }

  // 3. The pipeline has moved past the R&R stage while R&R is unfinished, so a
  // downstream stage is sitting on an obligation that was never discharged.
  const rrStage = ctx.stages.find((s) => Number(s.stageNumber) === 8);
  const rrStageIncomplete = rrStage ? rrStage.status !== "completed" : true;
  if (currentStage > 8 && rrStageIncomplete) {
    blocking = true;
    reasons.push(
      `The case has reached stage ${currentStage} while stage 8 (R&R) is not complete, so a downstream stage depends on an undischarged obligation.`,
    );
    blockingEvidence.push(
      evidence.add(
        "acquisition_stage",
        "stage_name",
        "Rehabilitation & Resettlement",
        "R&R stage remains incomplete while the case has advanced past it",
      ),
    );
  }

  // 5. An existing risk rule already names R&R as the blocking dependency.
  // No risk rule does today, so this contributes nothing for now; it exists so
  // the assessment stays correct if one is added.
  const riskReasons = Array.isArray(ctx.risk?.reasons) ? (ctx.risk!.reasons as unknown[]) : [];
  const riskNamesRAndR = riskReasons.some((r) => /rehabilitation|r&r|resettlement/i.test(String(r)));
  if (riskNamesRAndR) {
    blocking = true;
    reasons.push("The risk engine already identifies R&R as a contributing dependency.");
    blockingEvidence.push(
      evidence.add(
        "risk_score",
        "reasons",
        riskReasons.map((r) => String(r)).join("; "),
        "Risk engine identifies R&R as a blocking dependency",
      ),
    );
  }

  return { blocking, reasons, blockingEvidence };
}

export async function detectBottlenecks(
  ctx: CaseContext,
  evidence: EvidenceCollector,
): Promise<BottleneckScan> {
  const blockers: BlockerDraft[] = [];
  // Collected alongside blockers but never ranked with them, so an active
  // dependency can never become the primary blocker.
  const activeDependencies: ActiveDependency[] = [];
  const c = ctx.caseRow as Record<string, any>;
  const currentStage = Number(c.currentStage);
  const now = new Date();
  const nextStage = currentStage + 1;

  // --- Current stage overdue -> deadline blocker -------------------------
  const stage = ctx.stages.find((s) => Number(s.stageNumber) === currentStage);
  if (stage && (stage.status === "delayed" || stage.status === "blocked")) {
    const recordedDelay = Number(stage.delayDays ?? 0);
    const due = asDate(stage.dueDate);

    // The recorded delay_days and the due date can disagree (for example a
    // stage flagged delayed by the alert engine before its due date arrives).
    // Never assert "overdue" while the due date is still in the future — that
    // would be a checkable contradiction. Report both and let the discrepancy
    // speak for itself.
    const dueDatePassed = due !== null && due.getTime() <= Date.now();
    const daysPastDue = due !== null ? daysBetween(new Date(), due) : null;
    const computedOverdue = dueDatePassed && daysPastDue !== null && daysPastDue > 0 ? daysPastDue : 0;
    const delayDays = Math.max(recordedDelay, computedOverdue);
    const discrepancy =
      recordedDelay > 0 && computedOverdue === 0
        ? { days: recordedDelay, dueLabel: due ? isoDay(stage.dueDate) : "is not recorded" }
        : null;

    const ev = [
      evidence.add("acquisition_stage", "status", String(stage.status), `Stage ${currentStage} is ${stage.status}`),
      evidence.add(
        "acquisition_stage",
        "due_date",
        isoDay(stage.dueDate),
        "Stage deadline",
      ),
    ];
    if (recordedDelay > 0) {
      ev.push(
        evidence.add(
          "acquisition_stage",
          "delay_days",
          String(recordedDelay),
          `Workflow records this stage as ${recordedDelay} day${recordedDelay === 1 ? "" : "s"} delayed`,
        ),
      );
    }
    if (computedOverdue > 0) {
      ev.push(
        evidence.add(
          "acquisition_stage",
          "due_date",
          isoDay(stage.dueDate),
          `Due date passed ${computedOverdue} day${computedOverdue === 1 ? "" : "s"} ago`,
        ),
      );
    }
    if (discrepancy) {
      ev.push(
        evidence.add(
          "acquisition_stage",
          "delay_days",
          `${recordedDelay} recorded vs ${computedOverdue} computed`,
          "Recorded delay and due date are inconsistent",
        ),
      );
    }
    if (stage.responsibleDepartment) {
      ev.push(
        evidence.add(
          "acquisition_stage",
          "responsible_department",
          String(stage.responsibleDepartment),
          "Department accountable for this stage",
        ),
      );
    }

    // One statement, no repetition. When the two delay sources disagree the
    // sentence says so once and the evidence carries the raw numbers.
    const delayPhrase =
      computedOverdue > 0
        ? `The stage was due ${isoDay(stage.dueDate)} and is ${computedOverdue} day${computedOverdue === 1 ? "" : "s"} overdue.`
        : discrepancy
          ? `The workflow records this stage as ${recordedDelay} day${recordedDelay === 1 ? "" : "s"} delayed, but its due date (${discrepancy.dueLabel}) has not yet passed. The two records disagree and should be reconciled.`
          : recordedDelay > 0
            ? `The workflow records this stage as ${recordedDelay} day${recordedDelay === 1 ? "" : "s"} delayed.`
            : "The stage is not complete and no due date is recorded, so overdue time cannot be computed.";

    blockers.push({
      type: stage.status === "blocked" ? "dependency_blocker" : "deadline_blocker",
      title: `Stage ${currentStage} (${stage.stageName}) is ${stage.status}`,
      detail: delayPhrase,
      severity: delayDays >= 30 ? "critical" : delayDays >= 14 ? "high" : "medium",
      // Confidence is downgraded when the two delay sources disagree, because
      // the evidence is internally inconsistent.
      confidence: discrepancy ? "medium" : "high",
      delayContributionDays: delayDays,
      affectedStages: downstreamStages(currentStage),
      evidence: ev,
      recommendations: [
        {
          action: discrepancy
            ? `Reconcile the recorded delay (${recordedDelay} days) against the due date for ${stage.stageName}`
            : `Record the reason ${stage.stageName} is ${stage.status} and the expected completion date`,
          reason: discrepancy
            ? "Delay and due-date records disagree, so the true delay cannot be stated with confidence."
            : "An unrecorded reason leaves the delay unattributable and cannot be evidenced in audit.",
          responsibleRole: String(stage.responsibleDepartment ?? "Assigned Department"),
          dependency: null,
          priority: "high",
          evidenceIds: ev.map((e) => e.id),
        },
      ],
    });
  }

  // --- Documents pending / rejected at the current stage ----------------
  // Document states that mean the document has not been settled yet. Set-based
  // because the vocabulary distinguishes how far a document has got
  // (uploaded / under_review / expired) or that a REQUIRED document was never
  // supplied at all (missing). An exact "pending_verification" match would
  // silently ignore every one of those.
  const DOC_UNSETTLED = new Set([
    "pending_verification", "uploaded", "under_review", "missing", "expired",
  ]);
  const DOC_MISSING = "missing";

  const pendingDocs = ctx.documents.filter(
    (d) => DOC_UNSETTLED.has(d.verificationStatus as string) && d.verificationStatus !== DOC_MISSING,
  );
  const missingDocs = ctx.documents.filter((d) => d.verificationStatus === DOC_MISSING);
  const rejectedDocs = ctx.documents.filter((d) => d.verificationStatus === "rejected");

  // A required document that was never uploaded is a stronger blocker than one
  // that is merely awaiting a decision, so it is reported separately.
  if (missingDocs.length > 0) {
    const ev = missingDocs.map((d) =>
      evidence.add(
        "document",
        "verification_status",
        `${d.documentType}: ${d.fileName} (required, not uploaded)`,
        "A document required for this stage has not been supplied",
      ),
    );
    blockers.push({
      type: "document_blocker",
      title: `${missingDocs.length} required document${missingDocs.length === 1 ? "" : "s"} not supplied`,
      detail:
        "The stage cannot be completed because a required document has never been uploaded.",
      severity: "critical",
      confidence: "high",
      delayContributionDays: 0,
      affectedStages: [currentStage, nextStage],
      evidence: ev,
      recommendations: [
        {
          action: "Upload and verify the missing required document(s)",
          reason: "Stage completion is blocked until the required evidence exists.",
          responsibleRole: "Document Officer",
          dependency: `Stage ${currentStage} completion`,
          priority: "high",
          evidenceIds: ev.map((e) => e.id),
        },
      ],
    });
  }

  if (rejectedDocs.length > 0) {
    const ev = rejectedDocs.map((d) =>
      evidence.add(
        "document",
        "verification_status",
        `${d.documentType}: ${d.fileName} (rejected)`,
        "A rejected document must be resubmitted before the stage can complete",
      ),
    );
    blockers.push({
      type: "document_blocker",
      title: `${rejectedDocs.length} document${rejectedDocs.length === 1 ? "" : "s"} rejected`,
      detail:
        "Rejected documents block stage completion until corrected versions are uploaded and verified.",
      severity: "high",
      confidence: "high",
      delayContributionDays: 0,
      affectedStages: [currentStage, nextStage],
      evidence: ev,
      recommendations: [
        {
          action: "Resubmit and re-verify the rejected documents",
          reason: "A rejected document leaves the stage without a complete evidence set.",
          responsibleRole: "Assigned Officer",
          dependency: `Stage ${currentStage} completion`,
          priority: "high",
          evidenceIds: ev.map((e) => e.id),
        },
      ],
    });
  }

  if (pendingDocs.length > 0) {
    const oldest = [...pendingDocs].sort(
      (a, b) => new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime(),
    )[0];
    const ageDays = oldest?.createdAt ? daysBetween(now, new Date(oldest.createdAt as string)) : null;
    const ev = [
      ...pendingDocs.map((d) =>
        evidence.add(
          "document",
          "verification_status",
          `${d.documentType}: ${d.fileName} (${String(d.verificationStatus).replace(/_/g, " ")})`,
          "Verification not yet completed",
        ),
      ),
    ];
    if (ageDays !== null) {
      ev.push(
        evidence.add(
          "document",
          "created_at",
          isoDay(oldest!.createdAt),
          `Oldest pending document has awaited verification for ${ageDays} day${ageDays === 1 ? "" : "s"}`,
        ),
      );
    }
    blockers.push({
      type: "document_blocker",
      title: `${pendingDocs.length} document${pendingDocs.length === 1 ? "" : "s"} awaiting verification`,
      detail: `Verification has not been completed for the above documents${
        ageDays !== null ? `; the oldest has been waiting ${ageDays} day${ageDays === 1 ? "" : "s"}` : ""
      }.`,
      severity: pendingDocs.length > 2 || (ageDays !== null && ageDays > 14) ? "high" : "medium",
      confidence: "high",
      delayContributionDays: 0,
      affectedStages: [currentStage, nextStage],
      evidence: ev,
      recommendations: [
        {
          action: "Complete document verification for the pending set",
          reason: "Stage completion depends on verified documents.",
          responsibleRole: "Verifying Officer",
          dependency: `Stage ${currentStage} completion`,
          priority: pendingDocs.length > 2 ? "high" : "medium",
          evidenceIds: ev.map((e) => e.id),
        },
      ],
    });
  }

  // --- Compensation assessment / approval / payment ---------------------
  const comp = ctx.compensation;
  if (comp) {
    const approvalStatus = String(comp.approvalStatus ?? "unknown");
    const disbursementStatus = String(comp.disbursementStatus ?? "unknown");
    const amount = comp.assessmentAmount == null ? null : Number(comp.assessmentAmount);

    if (approvalStatus !== "approved" && currentStage >= 6) {
      const updated = asDate(comp.updatedAt);
      const waitingDays = updated ? daysBetween(now, updated) : null;
      const overdue = waitingDays !== null && waitingDays > APPROVAL_SLA_DAYS;

      const ev = [
        evidence.add("compensation", "approval_status", approvalStatus, "Compensation approval is not complete"),
      ];
      if (amount !== null) {
        ev.push(
          evidence.add(
            "compensation",
            "assessment_amount",
            `INR ${amount.toLocaleString("en-IN")}`,
            "Assessed compensation value for this parcel",
          ),
        );
      }
      if (waitingDays !== null && waitingDays > 0) {
        ev.push(
          evidence.add(
            "compensation",
            "updated_at",
            isoDay(comp.updatedAt),
            `Approval has been outstanding for ${waitingDays} day${waitingDays === 1 ? "" : "s"}`,
          ),
        );
      }

      const waitingPhrase =
        waitingDays === null
          ? "No timestamp is recorded for when approval was raised, so the waiting period cannot be computed."
          : waitingDays === 0
            ? "The compensation record was last updated today, so the approval waiting period cannot yet be established."
            : `Approval has been outstanding for ${waitingDays} day${waitingDays === 1 ? "" : "s"}` +
              (overdue ? `, which exceeds the ${APPROVAL_SLA_DAYS}-day service standard.` : ".");

      blockers.push({
        type: "approval_blocker",
        title: `Compensation approval is ${approvalStatus.replace(/_/g, " ")}`,
        detail: waitingPhrase,
        severity: overdue ? "critical" : "high",
        confidence: waitingDays === null || waitingDays === 0 ? "medium" : "high",
        delayContributionDays: waitingDays !== null ? waitingDays : 0,
        affectedStages: downstreamStages(Math.max(currentStage, 6)),
        evidence: ev,
        recommendations: [
          {
            action: "Review and dispose of the pending compensation approval",
            reason: overdue
              ? `Approval has exceeded the ${APPROVAL_SLA_DAYS}-day service standard.`
              : "Compensation approval gates the downstream pipeline.",
            responsibleRole: "Authorized Approving Authority",
            dependency: "Compensation assessment completion",
            priority: overdue ? "high" : "medium",
            evidenceIds: ev.map((e) => e.id),
          },
        ],
      });
    }

    if (disbursementStatus !== "disbursed" && currentStage >= 7) {
      const ev = [
        evidence.add(
          "compensation",
          "disbursement_status",
          disbursementStatus,
          "Payment has not been disbursed",
        ),
      ];
      blockers.push({
        type: "payment_blocker",
        title: `Compensation payment is ${disbursementStatus.replace(/_/g, " ")}`,
        detail: `Assessment is complete but disbursement is not, so the landowner has not been paid${
          comp.paymentReference ? " under the recorded reference" : ""
        }.`,
        severity: "high",
        confidence: "high",
        delayContributionDays: 0,
        affectedStages: downstreamStages(7),
        evidence: ev,
        recommendations: [
          {
            action: "Initiate compensation disbursement",
            reason: "Payment is outstanding and blocks rehabilitation and handover.",
            responsibleRole: "District Treasury",
            dependency: "Compensation approval",
            priority: "high",
            evidenceIds: ev.map((e) => e.id),
          },
        ],
      });
    } else if (approvalStatus === "approved" && disbursementStatus !== "disbursed") {
      const ev = [
        evidence.add(
          "compensation",
          "disbursement_status",
          disbursementStatus,
          "Approved but not yet disbursed",
        ),
      ];
      blockers.push({
        type: "payment_blocker",
        title: `Approved compensation is ${disbursementStatus.replace(/_/g, " ")}`,
        detail: "Assessment and approval are complete; only disbursement remains.",
        severity: "medium",
        confidence: "high",
        delayContributionDays: 0,
        affectedStages: downstreamStages(7),
        evidence: ev,
        recommendations: [
          {
            action: "Schedule compensation disbursement",
            reason: `Approved compensation has been awaiting payment for more than the ${PAYMENT_SLA_DAYS}-day standard.`,
            responsibleRole: "District Treasury",
            dependency: "Compensation approval (complete)",
            priority: "medium",
            evidenceIds: ev.map((e) => e.id),
          },
        ],
      });
    }
  }

  // --- Rehabilitation & resettlement -------------------------------------
  //
  // "Not complete" and "blocking" are different claims. An R&R record that is
  // merely in progress is reported as an active dependency so the loop can say
  // what is happening without asserting that the case is stuck. It is promoted
  // to a blocker only when the evidence below shows it is holding things up.
  const rr = ctx.rehabilitation;
  if (rr && currentStage >= 8) {
    const status = String(rr.status ?? "unknown");
    const statusLabel = status.replace(/_/g, " ");

    if (status === "completed") {
      // Nothing outstanding: not a blocker and not an active dependency.
    } else if (RR_ACTIVE_STATUSES.has(status)) {
      const { blocking, reasons, blockingEvidence } = assessInProgressRAndR(ctx, currentStage, evidence);
      const ev = [evidence.add("rehabilitation", "status", status, "R&R process has started")];
      if (rr.details) {
        ev.push(evidence.add("rehabilitation", "details", String(rr.details), "Recorded R&R position"));
      }

      activeDependencies.push({
        category: "r_and_r_blocker",
        classification: blocking ? "blocker" : "active_dependency",
        title: `Rehabilitation is ${statusLabel}`,
        reason: blocking
          ? `R&R is recorded as ${statusLabel} and the evidence shows it is preventing progress: ${reasons.join(" ")}`
          : "Rehabilitation and Resettlement is currently in progress. No evidence shows it is delaying the case.",
        severity: blocking ? "high" : "info",
        blocking,
        evidenceIds: [...ev, ...blockingEvidence].map((e) => e.id),
      });

      if (blocking) {
        const blockerEvidence = [...ev, ...blockingEvidence];
        blockers.push({
          type: "r_and_r_blocker",
          title: `Rehabilitation is ${statusLabel}`,
          detail: reasons.join(" "),
          severity: "high",
          confidence: "high",
          delayContributionDays: 0,
          affectedStages: downstreamStages(8),
          evidence: blockerEvidence,
          recommendations: [
            {
              action: "Clear the blocking R&R condition",
              reason: `R&R is ${statusLabel} and the following prevent progress: ${reasons.join(" ")}`,
              responsibleRole: RR_DEPARTMENT,
              dependency: "Compensation disbursement",
              priority: "high",
              evidenceIds: blockerEvidence.map((e) => e.id),
            },
          ],
        });
      }
    } else {
      // Existing behaviour for every other non-completed status: an unresolved
      // dispute, or a position where nothing has begun, is a blocker.
      const ev = [
        evidence.add("rehabilitation", "status", status, "Rehabilitation is not complete"),
      ];
      if (rr.details) {
        ev.push(evidence.add("rehabilitation", "details", String(rr.details), "Recorded R&R position"));
      }
      activeDependencies.push({
        category: "r_and_r_blocker",
        classification: "blocker",
        title: `Rehabilitation is ${statusLabel}`,
        reason: `R&R is recorded as ${statusLabel}, which is an unresolved position rather than work in progress.`,
        severity: "high",
        blocking: true,
        evidenceIds: ev.map((e) => e.id),
      });
      blockers.push({
        type: "r_and_r_blocker",
        title: `Rehabilitation is ${statusLabel}`,
        detail: "Land handover depends on rehabilitation and resettlement being complete.",
        severity: "high",
        confidence: "high",
        delayContributionDays: 0,
        affectedStages: downstreamStages(8),
        evidence: ev,
        recommendations: [
          {
            action: "Progress rehabilitation and resettlement activities to completion",
            reason: "Handover cannot proceed until rehabilitation obligations are discharged.",
            responsibleRole: RR_DEPARTMENT,
            dependency: "Compensation disbursement",
            priority: "high",
            evidenceIds: ev.map((e) => e.id),
          },
        ],
      });
    }
  }

  // --- Open grievances ---------------------------------------------------
  const openGrievances = ctx.grievances.filter(
    (g) => !["resolved", "rejected"].includes(String(g.status)),
  );
  if (openGrievances.length > 0) {
    const ev = openGrievances.map((g) =>
      evidence.add(
        "grievance",
        "status",
        `${g.grievanceNumber}: ${g.category} (${g.status})`,
        "An unresolved grievance may hold up consent and the next stage",
      ),
    );
    const oldest = [...openGrievances].sort(
      (a, b) => new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime(),
    )[0];
    const ageDays = oldest?.createdAt ? daysBetween(now, new Date(oldest.createdAt as string)) : null;
    if (ageDays !== null && ageDays > 0) {
      ev.push(
        evidence.add(
          "grievance",
          "created_at",
          isoDay(oldest!.createdAt),
          `Oldest open grievance is ${ageDays} day${ageDays === 1 ? "" : "s"} old`,
        ),
      );
    }
    const overdue = ageDays !== null && ageDays > GRIEVANCE_SLA_DAYS;

    blockers.push({
      type: "grievance_blocker",
      title: `${openGrievances.length} unresolved grievance${openGrievances.length === 1 ? "" : "s"}`,
      detail:
        ageDays === null
          ? "An open dispute can prevent progression to the next stage."
          : ageDays === 0
            ? "The oldest grievance was recorded today, so its age against the resolution standard is not yet established."
            : `The oldest has been open for ${ageDays} day${ageDays === 1 ? "" : "s"}${
                overdue ? `, exceeding the ${GRIEVANCE_SLA_DAYS}-day resolution standard.` : "."
              }`,
      severity: overdue ? "high" : "medium",
      confidence: "high",
      delayContributionDays: 0,
      affectedStages: [nextStage],
      evidence: ev,
      recommendations: [
        {
          action: "Resolve the open grievance(s) and record the outcome",
          reason: "An unresolved dispute on compensation or records can block the next stage.",
          responsibleRole: openGrievances[0].assignedOfficer
            ? `Assigned to ${openGrievances[0].assignedOfficer}`
            : "Grievance Redressal Authority",
          dependency: "Public notification acknowledgement",
          priority: overdue ? "high" : "medium",
          evidenceIds: ev.map((e) => e.id),
        },
      ],
    });
  }

  // --- Ownership verification -------------------------------------------
  if (!c.landownerRef) {
    const ev = [
      evidence.add(
        "land_parcel",
        "landowner_id",
        "not recorded",
        "No landowner is linked to this parcel, so ownership cannot be verified",
      ),
    ];
    blockers.push({
      type: "ownership_verification_blocker",
      title: "No verified landowner linked to the parcel",
      detail:
        "The parcel has no recorded landowner, so ownership and entitlement cannot be established for compensation or consent.",
      severity: "high",
      confidence: "high",
      delayContributionDays: 0,
      affectedStages: [currentStage, nextStage],
      evidence: ev,
      recommendations: [
        {
          action: "Complete land ownership record verification for the parcel",
          reason: "Compensation and R&R entitlements cannot be determined without a verified owner.",
          responsibleRole: "District Land Records Office",
          dependency: "Digital land and owner records",
          priority: "high",
          evidenceIds: ev.map((e) => e.id),
        },
      ],
    });
  }

  // --- Data quality: no stages at all ------------------------------------
  if (ctx.stages.length === 0) {
    const ev = [
      evidence.add("acquisition_stage", "stage", "no rows", "The case has no workflow stage records"),
    ];
    blockers.push({
      type: "data_quality_blocker",
      title: "No workflow stages recorded for this case",
      detail:
        "The case has a current_stage value but no acquisition_stages rows, so its position in the pipeline cannot be verified from the workflow engine.",
      severity: "critical",
      confidence: "high",
      delayContributionDays: 0,
      affectedStages: [currentStage],
      evidence: ev,
      recommendations: [
        {
          action: "Reconcile the case against the workflow engine and create the missing stage records",
          reason: "Analysis cannot be trusted while the case is missing its stage rows.",
          responsibleRole: "System Administrator",
          dependency: null,
          priority: "high",
          evidenceIds: ev.map((e) => e.id),
        },
      ],
    });
  }

  return { blockers, activeDependencies };
}

// ---------------------------------------------------------------------------
// Prioritization
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHT: Record<BottleneckSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const CONFIDENCE_WEIGHT: Record<BottleneckConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Ranks blockers by operational impact.
 *
 * The composite score is INTERNAL ONLY and never returned to the client. The UI
 * shows severity plus the transparent reason strings, because an unexplained
 * number in a government tool invites distrust and cannot be defended in audit.
 */
function prioritize(blockers: BlockerDraft[]) {
  return blockers
    .map((b) => {
      const downstream = b.affectedStages.length;
      const score =
        SEVERITY_WEIGHT[b.severity] *
        (1 + Math.min(b.delayContributionDays, 60) / 30) *
        (1 + Math.log2(1 + downstream)) *
        CONFIDENCE_WEIGHT[b.confidence];
      return { blocker: b, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.blocker);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function analyzeCase(caseId: string): Promise<CaseIntelligence | null> {
  const ctx = await loadCaseContext(caseId);
  if (!ctx || !ctx.caseRow) return null;

  const evidence = new EvidenceCollector();
  const c = ctx.caseRow as Record<string, any>;

  // Record the case's own identity as the first evidence item so every
  // conclusion can be traced back to the case it describes.
  evidence.add("acquisition_case", "case_number", String(c.caseNumber), "Case under analysis");
  evidence.add("acquisition_case", "status", String(c.status), "Current recorded case status");
  evidence.add("acquisition_case", "current_stage", String(c.currentStage), "Current pipeline position");
  evidence.add(
    "acquisition_stage",
    "stage_name",
    stageName(Number(c.currentStage)),
    "Name of the current stage",
  );
  if (c.assignedOfficer) {
    evidence.add(
      "acquisition_case",
      "assigned_officer",
      String(c.assignedOfficer),
      "Officer currently assigned to the case",
    );
  }
  if (c.ulpin) {
    evidence.add("land_parcel", "ulpin", String(c.ulpin), "Parcel under acquisition");
  }

  const { blockers: rawBlockers, activeDependencies } = await detectBottlenecks(ctx, evidence);
  const ranked = prioritize(rawBlockers);
  const primary = ranked[0] ?? null;

  // Delay impact: the maximum of the current stage's recorded delay and the
  // primary blocker's own contribution. Never invented — derived from columns.
  const currentStageRow = ctx.stages.find((s) => Number(s.stageNumber) === Number(c.currentStage));
  const recordedDelay = Number(currentStageRow?.delayDays ?? 0);
    const delayDays = Math.max(recordedDelay, primary?.delayContributionDays ?? 0);

  // Risk: reuse the existing deterministic engine. Never re-score, never let
  // the model adjust it.
  const computedRisk = await computeRiskScore(caseId);
  const riskDisagreement =
    computedRisk && computedRisk.level !== c.riskLevel
      ? {
          caseFieldLevel: String(c.riskLevel),
          computedLevel: computedRisk.level,
          computedScore: computedRisk.score,
          note: "The officer-set risk level and the computed risk score disagree. Both are shown; neither is overwritten.",
        }
      : null;

  const recommendations = dedupeRecommendations(
    ranked.flatMap((b) => b.recommendations).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)),
  ).slice(0, 5);

  // Dependency chain. It must start at the stage where the blockage actually
  // originates, which is normally the case's current stage — a blocker that
  // only lists downstream stages would otherwise start the chain one step too
  // late and hide the originating stage.
  const chainStart =
    primary && primary.affectedStages[0] != null && primary.affectedStages[0] <= Number(c.currentStage)
      ? primary.affectedStages[0]
      : Number(c.currentStage);
  const dependencyChain = buildDependencyChain(primary, chainStart, ctx);

  const summary = buildSummary({
    caseRow: c,
    primary,
    blockers: ranked,
    delayDays,
    recordedDelayDays: recordedDelay,
    risk: computedRisk,
  });

  return {
    analysisVersion: ANALYSIS_VERSION,
    caseId,
    caseNumber: String(c.caseNumber),
    projectName: c.projectName ? String(c.projectName) : null,
    projectAgency: c.projectAgency ? String(c.projectAgency) : null,
    districtName: c.districtName ? String(c.districtName) : null,
    ulpin: c.ulpin ? String(c.ulpin) : null,
    status: String(c.status),
    currentStage: Number(c.currentStage),
    currentStageName: stageName(Number(c.currentStage)),

    summary,
    primaryBlocker: primary
      ? {
          type: primary.type,
          title: primary.title,
          detail: primary.detail,
          severity: primary.severity,
          confidence: primary.confidence,
          evidenceIds: primary.evidence.map((e) => e.id),
        }
      : null,
    contributingFactors: ranked.slice(1).map((b) => ({
      type: b.type,
      title: b.title,
      detail: b.detail,
      severity: b.severity,
      confidence: b.confidence,
      evidenceIds: b.evidence.map((e) => e.id),
    })),
    allBlockers: ranked.map((b) => ({
      type: b.type,
      title: b.title,
      detail: b.detail,
      severity: b.severity,
      confidence: b.confidence,
      delayContributionDays: b.delayContributionDays,
      affectedStages: b.affectedStages,
      evidenceIds: b.evidence.map((e) => e.id),
    })),

    // Reported separately from the ranked blockers: an entry with
    // `blocking: false` describes work that is under way and is deliberately not
    // treated as a bottleneck anywhere in the response.
    activeDependencies,

    evidence: evidence.list(),
    dependencyChain,

    delayImpact: {
      delayDays,
      recordedStageDelayDays: recordedDelay,
      affectedStages: primary ? primary.affectedStages : [],
    },

    risk: computedRisk
      ? {
          score: computedRisk.score,
          level: computedRisk.level,
          reasons: computedRisk.reasons,
          recommendation: computedRisk.recommendation,
          source: "computed",
        }
      : {
          score: null,
          level: String(c.riskLevel),
          reasons: [],
          recommendation: null,
          source: "case_field",
        },
    riskDisagreement,

    recommendations,
    dataCompleteness: assessCompleteness(ctx),
    disclaimer:
      "Deterministic decision support computed from authorized BhoomiSetu records. Not a government decision and not legal advice. An authorized officer decides.",
  };
}

function priorityRank(p: IntelligenceRecommendation["priority"]): number {
  return p === "high" ? 0 : p === "medium" ? 1 : 2;
}

function dedupeRecommendations(list: IntelligenceRecommendation[]): IntelligenceRecommendation[] {
  const seen = new Set<string>();
  const out: IntelligenceRecommendation[] = [];
  for (const r of list) {
    const key = r.action.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function buildDependencyChain(
  primary: BlockerDraft | null,
  startStage: number,
  ctx: CaseContext,
) {
  if (!primary) return [];

  // The chain begins at the stage the primary blocker originates in, then walks
  // every stage it gates. De-duplicated, because the blocker can both originate
  // at a stage and list that stage among its affected stages.
  const stageNumbers: number[] = [startStage];
  for (const n of primary.affectedStages) {
    if (!stageNumbers.includes(n)) stageNumbers.push(n);
  }

  return stageNumbers.map((n, i) => {
    const row = ctx.stages.find((s) => Number(s.stageNumber) === n);
    return {
      stageNumber: n,
      stageName: row?.stageName ? String(row.stageName) : stageName(n),
      status: row?.status ? String(row.status) : "not_started",
      isCurrentBlocker: primary.affectedStages.includes(n) || i === 0,
      isPrimary: i === 0,
    };
  });
}

interface SummaryInput {
  caseRow: Record<string, any>;
  primary: BlockerDraft | null;
  blockers: BlockerDraft[];
  delayDays: number;
  recordedDelayDays: number;
  risk: Awaited<ReturnType<typeof computeRiskScore>>;
}

/**
 * Builds the executive summary. Every clause is assembled from field values
 * already recorded as evidence, so the prose cannot drift from the data.
 */
function buildSummary({
  caseRow,
  primary,
  blockers,
  delayDays,
  recordedDelayDays,
  risk,
}: SummaryInput): string {
  const caseNumber = String(caseRow.caseNumber);
  const stageLabel = `Stage ${caseRow.currentStage} (${stageName(Number(caseRow.currentStage))})`;

  if (!primary) {
    return `Case ${caseNumber} has no detected bottleneck. It is at ${stageLabel} with status "${caseRow.status}". No overdue stage, pending approval, unresolved grievance, or missing document was found.`;
  }

  const parts: string[] = [];
  parts.push(
    `Case ${caseNumber} is currently at ${stageLabel} with status "${caseRow.status}".`,
  );
  parts.push(`PRIMARY BLOCKER: ${primary.detail}`);

  if (recordedDelayDays > 0) {
    // Only the value actually recorded on the stage may be called "recorded".
    // `delayDays` is the larger of that and the primary blocker's own day
    // contribution, so describing it as the recorded delay overstated the
    // workflow record (e.g. printing a computed 30 days where the stage had 18).
    parts.push(
      `The workflow records a delay of ${recordedDelayDays} day${recordedDelayDays === 1 ? "" : "s"} on the current stage.`,
    );
  }

  // When the computed figure exceeds the record, say so rather than letting the
  // two appear to be the same number.
  if (delayDays > recordedDelayDays) {
    parts.push(
      `Evidence indicates the case has actually been stuck for ${delayDays} day${delayDays === 1 ? "" : "s"}, longer than the stage record shows.`,
    );
  }

  if (primary.affectedStages.length > 0) {
    const names = primary.affectedStages.slice(0, 3).map((n) => stageName(n));
    const more = primary.affectedStages.length - names.length;
    parts.push(
      `Downstream impact: ${names.join(", ")}${more > 0 ? ` and ${more} further stage${more === 1 ? "" : "s"}` : ""}.`,
    );
  }

  if (blockers.length > 1) {
    parts.push(
      `${blockers.length - 1} contributing factor${blockers.length - 1 === 1 ? "" : "s"} also detected: ${blockers
        .slice(1, 3)
        .map((b) => b.title)
        .join("; ")}${blockers.length > 3 ? "; and others" : ""}.`,
    );
  }

  if (risk) {
    parts.push(
      `Computed risk is ${risk.level.toUpperCase()} (${risk.score}/100) from the existing deterministic risk engine.`,
    );
  }

  return parts.join(" ");
}

function assessCompleteness(ctx: CaseContext) {
  const missing: string[] = [];
  if (ctx.stages.length === 0) missing.push("workflow stages");
  if (!ctx.compensation && Number(ctx.caseRow!.currentStage) >= 6) missing.push("compensation record");
  if (!ctx.rehabilitation && Number(ctx.caseRow!.currentStage) >= 8) missing.push("rehabilitation record");
  if (!ctx.risk) missing.push("computed risk score (not yet evaluated)");
  if (ctx.documents.length === 0) missing.push("documents");

  return {
    isComplete: missing.length === 0,
    missingSections: missing,
  };
}

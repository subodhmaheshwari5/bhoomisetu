import { pool, withTransaction } from "../config/db.js";
import { camelCaseKeys } from "../utils/rowMapper.js";
import type { RiskLevel } from "../types/index.js";

/**
 * Compensation statuses that mean "the money has not been approved yet".
 * Kept as a set so the step a record is waiting at (assessment_pending,
 * approval_pending, payment_pending) does not change how risk is scored.
 */
const APPROVAL_PENDING = new Set(["pending", "assessment_pending", "assessed", "approval_pending"]);

/** Compensation statuses that mean "approved but not yet paid out". */
const DISBURSEMENT_PENDING = new Set(["pending", "payment_pending", "approved"]);

/**
 * Document states that mean "this document is not settled yet" and therefore
 * adds delay risk. Set-based for the same reason as the compensation check: the
 * vocabulary distinguishes how far a document has got (uploaded, under_review,
 * expired) or that a required one was never supplied at all (missing).
 */
const DOC_PENDING = new Set([
  "pending_verification", "uploaded", "under_review", "missing", "expired",
]);
const DOC_REJECTED = new Set(["rejected"]);

/** Minimal query surface so callers can supply a transaction client. */
interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export interface RiskScoreResult {
  caseId: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
  recommendation: string;
  computedAt: string;
}

function levelFor(score: number): RiskLevel {
  if (score <= 30) return "low";
  if (score <= 60) return "medium";
  if (score <= 80) return "high";
  return "critical";
}

interface StageRow {
  stage_number: number;
  status: string;
  delay_days: number | null;
}

/**
 * Computes an explainable 0-100 delay-risk score from workflow indicators
 * already in the database — current-stage overdue days, how many earlier
 * stages were ever delayed, pending/rejected documents, open grievances
 * (disputes), and stuck compensation. This is a rules-based prototype
 * decision-support score, not a trained model — see the disclaimer in the
 * API response and the frontend panel that renders it (section 42 of the
 * brief: never claim ML-grade accuracy this isn't backed by).
 */
export async function computeRiskScore(
  caseId: string,
  executor: Queryable = pool,
): Promise<RiskScoreResult | null> {
  const { rows: caseRows } = await executor.query(
    `SELECT id, status, current_stage FROM acquisition_cases WHERE id = $1`,
    [caseId],
  );
  const acquisitionCase = caseRows[0];
  if (!acquisitionCase) return null;

  const { rows: stages } = await executor.query(
    `SELECT stage_number, status, delay_days FROM acquisition_stages WHERE case_id = $1 ORDER BY stage_number`,
    [caseId],
  ) as { rows: StageRow[] };
  const currentStage = stages.find((s) => s.stage_number === acquisitionCase.current_stage);
  const priorDelayedStages = stages.filter(
    (s) => s.stage_number < acquisitionCase.current_stage && s.status === "delayed",
  ).length;

  const { rows: docRows } = await executor.query(
    `SELECT verification_status AS status, count(*)::text AS count
     FROM documents WHERE case_id = $1 GROUP BY verification_status`,
    [caseId],
  );
  const countFor = (set: Set<string>) =>
    docRows.reduce((sum, r) => (set.has(r.status) ? sum + Number(r.count) : sum), 0);
  const pendingDocs = countFor(DOC_PENDING);
  const rejectedDocs = countFor(DOC_REJECTED);

  const { rows: grievanceRows } = await executor.query(
    `SELECT count(*)::text AS count FROM grievances
     WHERE case_id = $1 AND status NOT IN ('resolved', 'rejected')`,
    [caseId],
  );
  const openGrievances = Number(grievanceRows[0]?.count ?? 0);

  const { rows: compRows } = await executor.query(
    `SELECT approval_status, disbursement_status FROM compensation WHERE case_id = $1
     ORDER BY is_primary DESC LIMIT 1`,
    [caseId],
  );
  const compensation = compRows[0];

  // --- Scoring: each indicator contributes points, capped at 100. ---
  let score = 0;
  const reasons: string[] = [];

  const delayDays = currentStage?.delay_days ?? 0;
  if (currentStage?.status === "delayed" && delayDays > 0) {
    const points = Math.min(40, 10 + delayDays * 1.5);
    score += points;
    reasons.push(`Current stage overdue by ${delayDays} day${delayDays === 1 ? "" : "s"}.`);
  } else if (currentStage?.status === "blocked") {
    score += 25;
    reasons.push("Current stage is blocked pending resolution.");
  }

  if (priorDelayedStages > 0) {
    const points = Math.min(20, priorDelayedStages * 8);
    score += points;
    reasons.push(
      `${priorDelayedStages} earlier stage${priorDelayedStages === 1 ? " was" : "s were"} previously delayed.`,
    );
  }

  if (rejectedDocs > 0) {
    score += Math.min(15, rejectedDocs * 8);
    reasons.push(`${rejectedDocs} document${rejectedDocs === 1 ? "" : "s"} rejected and needs resubmission.`);
  }
  if (pendingDocs > 0) {
    score += Math.min(10, pendingDocs * 3);
    reasons.push(`${pendingDocs} document${pendingDocs === 1 ? "" : "s"} still pending verification.`);
  }

  if (openGrievances > 0) {
    score += Math.min(20, openGrievances * 12);
    reasons.push(`${openGrievances} open grievance${openGrievances === 1 ? "" : "s"} recorded on this case (dispute).`);
  }

  if (compensation) {
    // Set-based rather than an exact string match: the compensation vocabulary
    // distinguishes the step each record is waiting at (assessment_pending,
    // approval_pending, payment_pending). All of them mean "not yet approved",
    // and all of them contribute delay risk at the relevant stage.
    if (APPROVAL_PENDING.has(compensation.approval_status) && acquisitionCase.current_stage >= 6) {
      score += 8;
      reasons.push("Compensation approval still pending.");
    }
    if (DISBURSEMENT_PENDING.has(compensation.disbursement_status) && acquisitionCase.current_stage >= 7) {
      score += 7;
      reasons.push("Compensation disbursement still pending.");
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = levelFor(score);

  if (reasons.length === 0) {
    reasons.push("No overdue stages, disputes, or document issues detected.");
  }

  const recommendation =
    level === "critical"
      ? "Escalate immediately for District Officer review."
      : level === "high"
        ? "Prioritize this case for District Officer review."
        : level === "medium"
          ? "Monitor closely and follow up on pending items."
          : "No action needed — case is progressing normally.";

  return {
    caseId,
    score,
    level,
    reasons,
    recommendation,
    computedAt: new Date().toISOString(),
  };
}

/** Computes the score and persists it to risk_scores, so there's an audit trail of how risk changed over time. */
export async function computeAndStoreRiskScore(caseId: string): Promise<RiskScoreResult | null> {
  const result = await computeRiskScore(caseId);
  if (!result) return null;

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO risk_scores (case_id, score, level, reasons, recommendation, computed_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (case_id) DO UPDATE SET
         score = EXCLUDED.score, level = EXCLUDED.level, reasons = EXCLUDED.reasons,
         recommendation = EXCLUDED.recommendation, computed_at = now()`,
      [result.caseId, result.score, result.level, JSON.stringify(result.reasons), result.recommendation],
    );
  });

  return result;
}

export async function getStoredRiskScore(caseId: string) {
  const { rows } = await pool.query(
    `SELECT case_id, score, level, reasons, recommendation, computed_at FROM risk_scores WHERE case_id = $1`,
    [caseId],
  );
  return rows[0] ? camelCaseKeys(rows[0]) : null;
}

/**
 * Computes and persists risk for many cases using a caller-supplied executor.
 *
 * Used by the demo seeder, which must stay inside its own transaction: opening a
 * nested transaction per case here would deadlock against it. Risk is computed
 * by the real engine rather than being invented, so seeded risk always agrees
 * with the rules the running application applies.
 */
export async function computeRiskForCases(caseIds: string[], executor: Queryable = pool): Promise<number> {
  let computed = 0;
  for (const caseId of caseIds) {
    const result = await computeRiskScore(caseId, executor);
    if (!result) continue;

    await executor.query(
      `INSERT INTO risk_scores (case_id, score, level, reasons, recommendation, computed_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (case_id) DO UPDATE SET
         score = EXCLUDED.score, level = EXCLUDED.level, reasons = EXCLUDED.reasons,
         recommendation = EXCLUDED.recommendation, computed_at = now()`,
      [result.caseId, result.score, result.level, JSON.stringify(result.reasons), result.recommendation],
    );
    computed += 1;
  }
  return computed;
}

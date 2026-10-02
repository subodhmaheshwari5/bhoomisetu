import { pool } from "../config/db.js";
import { camelCaseRows } from "../utils/rowMapper.js";
import { applyCaseScope } from "./intelligenceAuthz.js";
import type { AuthenticatedUser } from "../types/index.js";

/**
 * Headline KPIs, scoped to the cases the caller may see.
 *
 * A national `totalCases` is itself a disclosure: a landowner shown "147 total
 * cases" learns the size of the estate they are not party to. The counts are
 * therefore computed over the same scope as GET /api/cases, so the dashboard
 * total can never exceed the rows the caller could actually list.
 */
export async function getKpiSummary(user: AuthenticatedUser) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  applyCaseScope(clauses, params, user, "c");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const { rows } = await pool.query<{
    total_cases: string;
    active_acquisitions: string;
    pending_approvals: string;
    compensation_pending: string;
    delayed_cases: string;
    completed_cases: string;
  }>(
    `
    SELECT
      count(*) AS total_cases,
      -- "Active" means work that is genuinely moving: on track, in progress, or
      -- at risk. in_progress was missing here, so every case in ordinary
      -- progress was silently excluded from the headline KPI. on_hold is
      -- deliberately excluded because a held case is paused, not active, and
      -- delayed/completed have their own dedicated tiles.
      -- NOTE: no backticks in this comment; it lives inside a template literal.
      count(*) FILTER (WHERE status IN ('on_track', 'in_progress', 'at_risk')) AS active_acquisitions,
      count(*) FILTER (WHERE current_stage = 4) AS pending_approvals,
      count(*) FILTER (WHERE current_stage IN (6, 7)) AS compensation_pending,
      count(*) FILTER (WHERE status = 'delayed') AS delayed_cases,
      count(*) FILTER (WHERE status = 'completed') AS completed_cases
    FROM acquisition_cases c
    ${where}
  `,
    params,
  );

  const row = rows[0];
  return {
    totalCases: Number(row.total_cases),
    activeAcquisitions: Number(row.active_acquisitions),
    pendingApprovals: Number(row.pending_approvals),
    compensationPending: Number(row.compensation_pending),
    delayedCases: Number(row.delayed_cases),
    completedCases: Number(row.completed_cases),
  };
}

/**
 * The most overdue in-progress/delayed stage per case, surfaced as a priority
 * alert.
 *
 * Scoped to the caller's visible cases: an alert row carries a case number and
 * stage name, so an unscoped list disclosed which cases elsewhere were falling
 * behind. The limit is applied last, after the scope, so it can never be used to
 * page through out-of-scope alerts.
 */
export async function getPriorityAlerts(user: AuthenticatedUser, limit = 10) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  applyCaseScope(clauses, params, user, "c");
  clauses.push(`s.status = 'delayed'`);

  params.push(limit);

  const { rows } = await pool.query(
    `
    SELECT
      c.id AS case_id,
      c.case_number,
      c.risk_level,
      s.stage_name,
      s.delay_days
    FROM acquisition_cases c
    JOIN acquisition_stages s
      ON s.case_id = c.id AND s.stage_number = c.current_stage
    WHERE ${clauses.join(" AND ")}
    ORDER BY s.delay_days DESC NULLS LAST, c.risk_level DESC
    LIMIT $${params.length}
  `,
    params,
  );

  return camelCaseRows(rows).map((row: Record<string, unknown>) => ({
    caseId: row.caseId,
    caseNumber: row.caseNumber,
    riskLevel: row.riskLevel,
    issue: `${row.stageName} deadline exceeded`,
    durationDays: row.delayDays ?? 0,
    recommendedAction: "District Officer Review",
  }));
}

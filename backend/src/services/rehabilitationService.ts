import { pool } from "../config/db.js";
import { camelCaseRows } from "../utils/rowMapper.js";
import { applyCaseScope } from "./intelligenceAuthz.js";
import type { AuthenticatedUser } from "../types/index.js";

/**
 * Rehabilitation & Resettlement records.
 *
 * One record per affected parcel (unique index on parcel_id). R&R status is
 * stored as TEXT, but the closed set of values is enforced by the
 * `rehabilitation_status_check` constraint added in schema_ext.sql and mirrored
 * by the list below, so the two cannot drift: an unknown status cannot reach
 * the database, and a value cannot be added here without the constraint.
 *
 * The set is the 11 specification values plus `in_progress`:
 *
 *   IN_PROGRESS -> the R&R process has started but is not yet completed.
 *
 * It is an active/in-flight state. It is never silently folded into another
 * status, and it is distinct from both the terminal `completed` state and the
 * `not_started` pending state.
 */
export const REHABILITATION_STATUSES = [
  "not_started",
  "in_progress",
  "eligibility_pending",
  "eligible",
  "entitlement_pending",
  "entitlement_approved",
  "assistance_pending",
  "assistance_provided",
  "resettlement_pending",
  "resettled",
  "completed",
  "disputed",
] as const;

export type RehabilitationStatus = (typeof REHABILITATION_STATUSES)[number];

/** Terminal state: the R&R package has been fully delivered. */
export const REHABILITATION_COMPLETED_STATUSES = ["completed"] as const;

/**
 * Pending state: the process has not begun. Only `not_started` qualifies; the
 * other `*_pending` values have work underway and are therefore in flight.
 */
export const REHABILITATION_NOT_STARTED_STATUSES = ["not_started"] as const;

/** Human labels for the UI; keeps the raw values available for filtering. */
export const REHABILITATION_STATUS_LABELS: Record<RehabilitationStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  eligibility_pending: "Eligibility Pending",
  eligible: "Eligible",
  entitlement_pending: "Entitlement Pending",
  entitlement_approved: "Entitlement Approved",
  assistance_pending: "Assistance Pending",
  assistance_provided: "Assistance Provided",
  resettlement_pending: "Resettlement Pending",
  resettled: "Resettled",
  completed: "Completed",
  disputed: "Disputed",
};

export interface RehabilitationFilters {
  status?: string;
  caseId?: string;
  search?: string;
}

/**
 * Lists R&R records for cases the caller may see.
 *
 * Scoped in SQL with the shared case scope, so R&R cannot become a side channel
 * around the case list: the set of cases visible here is identical to the set
 * returned by GET /api/cases for the same caller. The caller's filters are ANDed
 * with the scope, so they can only narrow it.
 */
export async function listRehabilitation(
  filters: RehabilitationFilters,
  user: AuthenticatedUser,
) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  applyCaseScope(clauses, params, user, "c");

  if (filters.status) {
    params.push(filters.status);
    clauses.push(`r.status = $${params.length}`);
  }
  if (filters.caseId) {
    params.push(filters.caseId);
    clauses.push(`r.case_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    clauses.push(
      `(c.case_number ILIKE $${params.length} OR r.affected_family ILIKE $${params.length}
        OR COALESCE(lp.ulpin, '') ILIKE $${params.length})`,
    );
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT r.id, r.case_id, c.case_number, c.current_stage, c.status AS case_status,
            r.parcel_id, lp.ulpin, d.name AS district_name,
            r.affected_family, r.eligibility, r.entitlement, r.assistance,
            r.housing, r.livelihood, r.resettlement,
            r.status, r.details, r.target_date, r.updated_at
     FROM rehabilitation r
     JOIN acquisition_cases c ON c.id = r.case_id
     JOIN districts d ON d.id = c.district_id
     LEFT JOIN land_parcels lp ON lp.id = r.parcel_id
     ${where}
     ORDER BY r.updated_at DESC`,
    params,
  );

  return camelCaseRows(rows);
}

/**
 * Status totals for the caller's scope.
 *
 * Computed in the same query shape as the list so the tile counts can never
 * disagree with the rows beneath them.
 *
 * The counts fall into three mutually exclusive, exhaustive buckets over the
 * total, so a dashboard can always reconcile them:
 *
 *   completed  - terminal, the package was delivered
 *   notStarted - pending, nothing has begun
 *   inFlight   - active, everything else, which includes `in_progress`
 *
 * `disputed` is an overlay rather than a fourth bucket: a disputed record is
 * still one of the three above, so it is reported alongside them and is not
 * subtracted from `inFlight`.
 */
export async function getRehabilitationSummary(user: AuthenticatedUser) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  applyCaseScope(clauses, params, user, "c");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const { rows } = await pool.query<{ status: string; count: string }>(
    `SELECT r.status, count(*)::text AS count
     FROM rehabilitation r
     JOIN acquisition_cases c ON c.id = r.case_id
     ${where}
     GROUP BY r.status`,
    params,
  );

  const counts = new Map(rows.map((r) => [r.status, Number(r.count)]));
  const byStatus = REHABILITATION_STATUSES.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }));

  // Summed from the grouped rows rather than from `byStatus` so a status outside
  // the declared set can never silently shrink the total below the row count.
  const total = rows.reduce((sum, r) => sum + Number(r.count), 0);

  const sumOf = (statuses: readonly string[]) =>
    statuses.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0);

  const completed = sumOf(REHABILITATION_COMPLETED_STATUSES);
  const notStarted = sumOf(REHABILITATION_NOT_STARTED_STATUSES);
  const disputed = counts.get("disputed") ?? 0;
  /** Records explicitly sitting in the `in_progress` state. */
  const inProgress = counts.get("in_progress") ?? 0;
  // Active work: everything that is neither terminal nor untouched. `in_progress`
  // lands here, which is what makes it an in-flight state rather than a
  // synonym for either terminal or pending.
  const inFlight = total - completed - notStarted;

  return {
    total,
    completed,
    notStarted,
    inProgress,
    disputed,
    inFlight,
    completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
    byStatus,
  };
}

import { pool } from "../config/db.js";
import { applyCaseScope } from "./intelligenceAuthz.js";
import type { AuthenticatedUser } from "../types/index.js";

/**
 * Analytics aggregates, scoped to the cases the caller may see.
 *
 * Every function here counts cases, so an unscoped version discloses the size and
 * shape of the estate a caller is not party to — a delayed-case count is a
 * count of other people's stalled files. The scope is applied as a WHERE
 * predicate on the cases alias, and the WHERE keyword is omitted when the caller
 * is unrestricted.
 *
 * District *names* are treated as public reference data (they already appear in
 * navigation and are not case data), so `districtPerformance` still lists every
 * district but with 0 for those holding no visible case.
 */

function scoped(user: AuthenticatedUser) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  applyCaseScope(clauses, params, user, "c");
  return { clauses, params };
}

export async function getStageDistribution(user: AuthenticatedUser) {
  const { clauses, params } = scoped(user);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query<{ stage_number: number; stage_name: string; count: string }>(
    `
    SELECT s.stage_number, s.stage_name, count(*)::text AS count
    FROM acquisition_stages s
    JOIN acquisition_cases c ON c.id = s.case_id AND c.current_stage = s.stage_number
    ${where}
    GROUP BY s.stage_number, s.stage_name
    ORDER BY s.stage_number
  `,
    params,
  );
  return rows.map((r) => ({ stageNumber: r.stage_number, stageName: r.stage_name, count: Number(r.count) }));
}

export async function getDistrictPerformance(user: AuthenticatedUser) {
  const { clauses, params } = scoped(user);
  // The district name is public reference data; only the case count is scoped.
  // The scope predicates are attached to the LEFT JOIN's ON clause rather than
  // a WHERE, so districts holding no visible case still appear with a count of 0
  // instead of dropping out of the list.
  const joinScope = clauses.length ? `AND ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query<{ district: string; cases: string }>(
    `
    SELECT d.name AS district, count(c.id)::text AS cases
    FROM districts d
    LEFT JOIN acquisition_cases c ON c.district_id = d.id ${joinScope}
    GROUP BY d.name
    ORDER BY count(c.id) DESC, d.name
  `,
    params,
  );
  return rows.map((r) => ({ district: r.district, cases: Number(r.cases) }));
}

/**
 * Case counts per status.
 *
 * The status list is read from the live `case_status` enum rather than
 * hardcoded. A hardcoded list silently dropped every case sitting in
 * `in_progress` or `on_hold` — the counts still summed to fewer than the total
 * number of cases, with no error to explain the gap. Deriving the list from the
 * enum means a new status shows up here as soon as it is added, instead of
 * requiring a matching code change.
 */
export async function getCaseStatusBreakdown(user: AuthenticatedUser) {
  const enumRows = await pool.query<{ enumlabel: string }>(
    `SELECT enumlabel FROM pg_enum
     JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
     WHERE pg_type.typname = 'case_status'`,
  );

  // Keep the specification's canonical order, then append any newer values the
  // database knows about so they are never hidden.
  const canonical = ["completed", "on_track", "in_progress", "at_risk", "delayed", "on_hold"];
  const known = new Set(enumRows.rows.map((r) => r.enumlabel));
  const ordered = [
    ...canonical.filter((s) => known.has(s)),
    ...enumRows.rows.map((r) => r.enumlabel).filter((s) => !canonical.includes(s)),
  ];

  const { clauses, params } = scoped(user);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query<{ status: string; count: string }>(
    `
    SELECT c.status, count(*)::text AS count
    FROM acquisition_cases c
    ${where}
    GROUP BY c.status
  `,
    params,
  );
  const byStatus = new Map(rows.map((r) => [r.status, Number(r.count)]));
  return ordered.map((status) => ({ status, count: byStatus.get(status) ?? 0 }));
}

export async function getBottleneckAnalytics(user: AuthenticatedUser) {
  const { clauses, params } = scoped(user);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query<{ stage_name: string; delayed_count: string; avg_delay_days: string | null }>(
    `
    SELECT s.stage_name, count(*) FILTER (WHERE s.status = 'delayed')::text AS delayed_count,
           avg(s.delay_days) FILTER (WHERE s.status = 'delayed')::text AS avg_delay_days
    FROM acquisition_stages s
    JOIN acquisition_cases c ON c.id = s.case_id
    ${where}
    GROUP BY s.stage_name, s.stage_number
    ORDER BY s.stage_number
  `,
    params,
  );
  return rows.map((r) => ({
    stageName: r.stage_name,
    delayedCount: Number(r.delayed_count),
    averageDelayDays: r.avg_delay_days ? Math.round(Number(r.avg_delay_days)) : 0,
  }));
}

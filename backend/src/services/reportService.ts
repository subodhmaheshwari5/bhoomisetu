import { pool } from "../config/db.js";
import { camelCaseRows } from "../utils/rowMapper.js";
import { applyCaseScope } from "./intelligenceAuthz.js";
import type { AuthenticatedUser } from "../types/index.js";

export type ReportType = "progress" | "delayed" | "compensation" | "district-performance" | "grievance-status";

export interface ReportFilters {
  districtId?: string;
  status?: string;
}

/**
 * Builds the WHERE fragment for a case-derived report.
 *
 * A report is an export: it can contain every row a list endpoint would page
 * through. Two problems had to be closed here.
 *
 *   - The caller's own `districtId` filter was trusted, so any authenticated
 *     user could ask for any district by id.
 *   - Omitting the filter returned every district, so the "optional" filter was
 *     in practice unrestricted access.
 *
 * The authorization scope is therefore ANDed with the caller's filter. A
 * district officer who passes another district's id gets the intersection, which
 * is empty, rather than a wider result set.
 */
function scopeFor(
  user: AuthenticatedUser,
  filters: ReportFilters,
  base: string[],
  params: unknown[],
): string {
  const clauses = [...base];
  applyCaseScope(clauses, params, user, "c");

  if (filters.districtId) {
    params.push(filters.districtId);
    clauses.push(`c.district_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`c.status = $${params.length}`);
  }

  return `WHERE ${clauses.join(" AND ")}`;
}

export async function generateReport(
  type: ReportType,
  filters: ReportFilters,
  user: AuthenticatedUser,
) {
  switch (type) {
    case "progress": {
      const clauses: string[] = [];
      const params: unknown[] = [];
      const where = scopeFor(user, filters, clauses, params);
      const { rows } = await pool.query(
        `SELECT c.case_number, pr.name AS project, d.name AS district, c.current_stage, c.status, c.risk_level, c.updated_at
         FROM acquisition_cases c
         JOIN projects pr ON pr.id = c.project_id
         JOIN districts d ON d.id = c.district_id
         ${where}
         ORDER BY c.updated_at DESC`,
        params,
      );
      return camelCaseRows(rows);
    }
    case "delayed": {
      const clauses: string[] = ["c.status = 'delayed'"];
      const params: unknown[] = [];
      const where = scopeFor(user, filters, clauses, params);
      const { rows } = await pool.query(
        `SELECT c.case_number, pr.name AS project, d.name AS district, s.stage_name, s.delay_days
         FROM acquisition_cases c
         JOIN projects pr ON pr.id = c.project_id
         JOIN districts d ON d.id = c.district_id
         JOIN acquisition_stages s ON s.case_id = c.id AND s.stage_number = c.current_stage
         ${where}
         ORDER BY s.delay_days DESC NULLS LAST`,
        params,
      );
      return camelCaseRows(rows);
    }
    case "compensation": {
      const clauses: string[] = [];
      const params: unknown[] = [];
      const where = scopeFor(user, filters, clauses, params);
      const { rows } = await pool.query(
        `SELECT c.case_number, comp.assessment_amount, comp.approval_status, comp.disbursement_status, comp.payment_date
         FROM compensation comp
         JOIN acquisition_cases c ON c.id = comp.case_id
         ${where}
         ORDER BY comp.updated_at DESC`,
        params,
      );
      return camelCaseRows(rows);
    }
    case "district-performance": {
      // District names are public reference data; only the counts are scoped, and
      // the scope sits on the LEFT JOIN's ON clause so empty districts still list.
      const clauses: string[] = [];
      const params: unknown[] = [];
      applyCaseScope(clauses, params, user, "c");
      const joinScope = clauses.length ? `AND ${clauses.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `SELECT d.name AS district, count(c.id) AS total_cases,
                count(c.id) FILTER (WHERE c.status = 'delayed') AS delayed_cases,
                count(c.id) FILTER (WHERE c.status = 'completed') AS completed_cases
         FROM districts d
         LEFT JOIN acquisition_cases c ON c.district_id = d.id ${joinScope}
         GROUP BY d.name
         ORDER BY d.name`,
        params,
      );
      return camelCaseRows(rows);
    }
    case "grievance-status": {
      // Scoped through the case when the grievance is case-linked. Grievances
      // filed without a case (e.g. a general complaint) are visible only to
      // unrestricted callers, so a district-scoped officer cannot enumerate
      // unlinked grievances nationwide.
      const clauses: string[] = [];
      const params: unknown[] = [];
      applyCaseScope(clauses, params, user, "c");

      if (filters.status) {
        params.push(filters.status);
        clauses.push(`g.status = $${params.length}`);
      }
      const where = `WHERE ${clauses.join(" AND ")}`;

      const { rows } = await pool.query(
        `SELECT g.grievance_number, g.category, g.status, g.assigned_officer, g.created_at
         FROM grievances g
         JOIN acquisition_cases c ON c.id = g.case_id
         ${where}
         ORDER BY g.created_at DESC`,
        params,
      );
      return camelCaseRows(rows);
    }
  }
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const str = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))];
  return lines.join("\n");
}

import { pool } from "../config/db.js";
import { camelCaseRows } from "../utils/rowMapper.js";
import { applyCaseScope } from "./intelligenceAuthz.js";
import type { AuthenticatedUser } from "../types/index.js";

/**
 * Lists compensation records for cases the caller may see.
 *
 * This is financial data (assessment and payment amounts). It was previously
 * returned in full to every authenticated role, including landowners, who have
 * no claim to other people's payment records. Scope is applied in SQL using the
 * shared case scope, and the WHERE keyword is omitted when unrestricted.
 */
export async function listCompensation(user: AuthenticatedUser) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  applyCaseScope(clauses, params, user, "c");

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `
    SELECT
      comp.id, comp.case_id, c.case_number,
      comp.assessment_amount, comp.approval_status, comp.disbursement_status,
      comp.payment_date, comp.payment_reference, comp.updated_at
    FROM compensation comp
    JOIN acquisition_cases c ON c.id = comp.case_id
    ${where}
    ORDER BY comp.updated_at DESC
  `,
    params,
  );
  return camelCaseRows(rows);
}

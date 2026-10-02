import { pool, withTransaction } from "../config/db.js";
import { camelCaseRows, camelCaseKeys } from "../utils/rowMapper.js";
import { nextGrievanceNumber } from "../utils/idGenerators.js";
import { ApiError } from "../utils/apiResponse.js";
import { applyCaseScope } from "./intelligenceAuthz.js";
import type { AuthenticatedUser } from "../types/index.js";
import type { z } from "zod";
import type { createGrievanceSchema, updateGrievanceSchema } from "../validators/schemas.js";

const GRIEVANCE_SELECT = `
  SELECT
    g.id, g.grievance_number, g.case_id, c.case_number, g.landowner_id,
    g.category, g.description, g.status, g.assigned_officer, g.resolution,
    g.created_at, g.updated_at
  FROM grievances g
  LEFT JOIN acquisition_cases c ON c.id = g.case_id
`;

export interface GrievanceFilters {
  status?: string;
  category?: string;
}

/**
 * Lists grievances, scoped to the cases the caller may see.
 *
 * Grievance rows carry a landowner's account of a dispute, so this list was a
 * significant disclosure: it previously returned every grievance in the system,
 * including other people's case numbers and descriptions, to any authenticated
 * role.
 *
 * Because the case join is a LEFT JOIN, the scope predicates on the case alias
 * naturally exclude grievances that are not linked to any case. That is the
 * intended behaviour for a scoped caller — an unlinked complaint has no district
 * to attribute it to, so it belongs to the unrestricted work queue. A landowner
 * reads their own grievances through /api/landowner/me/grievances instead.
 */
export async function listGrievances(filters: GrievanceFilters, user: AuthenticatedUser) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  applyCaseScope(clauses, params, user, "c");

  if (filters.status) {
    params.push(filters.status);
    clauses.push(`g.status = $${params.length}`);
  }
  if (filters.category) {
    params.push(filters.category);
    clauses.push(`g.category = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(`${GRIEVANCE_SELECT} ${where} ORDER BY g.created_at DESC`, params);
  return camelCaseRows(rows);
}

export async function createGrievance(input: z.infer<typeof createGrievanceSchema>, submittedByUserId: string | null) {
  return withTransaction(async (client) => {
    const grievanceNumber = await nextGrievanceNumber(client);

    // If the submitter is a linked landowner, attach their landowner_id automatically.
    let landownerId: string | null = null;
    if (submittedByUserId) {
      const { rows: ownerRows } = await client.query<{ id: string }>(
        `SELECT id FROM landowners WHERE user_id = $1`,
        [submittedByUserId],
      );
      landownerId = ownerRows[0]?.id ?? null;
    }

    const { rows } = await client.query(
      `INSERT INTO grievances (grievance_number, case_id, landowner_id, category, description, status)
       VALUES ($1, $2, $3, $4, $5, 'submitted') RETURNING id`,
      [grievanceNumber, input.caseId ?? null, landownerId, input.category, input.description],
    );
    const grievanceId = rows[0].id as string;

    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, new_value) VALUES ($1, 'GRIEVANCE_SUBMITTED', 'grievance', $2, $3)`,
      [submittedByUserId, grievanceId, JSON.stringify({ grievanceNumber })],
    );

    const { rows: full } = await client.query(`${GRIEVANCE_SELECT} WHERE g.id = $1`, [grievanceId]);
    return camelCaseKeys(full[0]);
  });
}

export async function updateGrievance(id: string, input: z.infer<typeof updateGrievanceSchema>, updatedByUserId: string) {
  return withTransaction(async (client) => {
    const { rows: existingRows } = await client.query(`SELECT * FROM grievances WHERE id = $1`, [id]);
    const existing = existingRows[0];
    if (!existing) {
      throw new ApiError(404, "GRIEVANCE_NOT_FOUND", "Grievance not found.");
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of [
      ["status", "status"],
      ["assignedOfficer", "assigned_officer"],
      ["resolution", "resolution"],
    ] as const) {
      const value = (input as Record<string, unknown>)[key];
      if (value !== undefined) {
        params.push(value);
        fields.push(`${column} = $${params.length}`);
      }
    }

    if (fields.length > 0) {
      params.push(id);
      await client.query(`UPDATE grievances SET ${fields.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);

      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, previous_value, new_value)
         VALUES ($1, 'GRIEVANCE_UPDATED', 'grievance', $2, $3, $4)`,
        [updatedByUserId, id, JSON.stringify(existing), JSON.stringify(input)],
      );
    }

    const { rows } = await client.query(`${GRIEVANCE_SELECT} WHERE g.id = $1`, [id]);
    return camelCaseKeys(rows[0]);
  });
}

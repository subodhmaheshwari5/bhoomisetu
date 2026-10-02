import { pool, withTransaction } from "../config/db.js";
import { camelCaseRows, camelCaseKeys } from "../utils/rowMapper.js";
import { nextCaseNumber } from "../utils/idGenerators.js";
import { ApiError } from "../utils/apiResponse.js";
import { applyCaseScope } from "./intelligenceAuthz.js";
import { PIPELINE_STAGES } from "../types/index.js";
import type { AuthenticatedUser } from "../types/index.js";
import type { z } from "zod";
import type { createCaseSchema, updateCaseSchema, updateStageSchema } from "../validators/schemas.js";

const CASE_SELECT = `
  SELECT
    c.id, c.case_number, c.project_id, pr.name AS project_name, pr.agency,
    c.parcel_id, lp.ulpin,
    c.district_id, d.name AS district_name, d.state_name,
    c.current_stage, c.status, c.risk_level, c.assigned_officer,
    c.created_at, c.updated_at
  FROM acquisition_cases c
  JOIN projects pr ON pr.id = c.project_id
  JOIN land_parcels lp ON lp.id = c.parcel_id
  JOIN districts d ON d.id = c.district_id
`;

export interface CaseFilters {
  status?: string;
  riskLevel?: string;
  districtId?: string;
  projectId?: string;
  search?: string;
}

/**
 * Lists acquisition cases visible to the caller.
 *
 * The authorization scope is applied as a SQL predicate (see applyCaseScope) and
 * combined with the caller's filters using AND. Two properties matter here:
 *
 *   - Scope is never weakened by a query parameter. A district officer who
 *     passes another district's id gets the intersection (their own district AND
 *     that one), which is empty — not a wider result set.
 *   - Unrestricted roles add no clause, so the WHERE keyword is omitted
 *     entirely. Emitting a bare "WHERE" before ORDER BY is a syntax error; this
 *     bug previously shipped in the Documents implementation.
 */
export async function listCases(filters: CaseFilters, user: AuthenticatedUser) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  // Authorization first, then filters — both ANDed together.
  applyCaseScope(clauses, params, user, "c");

  if (filters.status) {
    params.push(filters.status);
    clauses.push(`c.status = $${params.length}`);
  }
  if (filters.riskLevel) {
    params.push(filters.riskLevel);
    clauses.push(`c.risk_level = $${params.length}`);
  }
  if (filters.districtId) {
    params.push(filters.districtId);
    clauses.push(`c.district_id = $${params.length}`);
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    clauses.push(`c.project_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    clauses.push(`(c.case_number ILIKE $${params.length} OR pr.name ILIKE $${params.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(`${CASE_SELECT} ${where} ORDER BY c.updated_at DESC`, params);
  return camelCaseRows(rows);
}

export async function getCaseById(id: string) {
  const { rows } = await pool.query(`${CASE_SELECT} WHERE c.id = $1`, [id]);
  if (!rows[0]) {
    throw new ApiError(404, "CASE_NOT_FOUND", "Acquisition case not found");
  }
  return camelCaseKeys(rows[0]);
}

export async function getCaseByCaseNumber(caseNumber: string) {
  const { rows } = await pool.query(`${CASE_SELECT} WHERE c.case_number = $1`, [caseNumber]);
  if (!rows[0]) {
    throw new ApiError(404, "CASE_NOT_FOUND", "Acquisition case not found");
  }
  return camelCaseKeys(rows[0]);
}

export async function createCase(input: z.infer<typeof createCaseSchema>, createdByUserId: string) {
  return withTransaction(async (client) => {
    const caseNumber = await nextCaseNumber(client);

    const { rows } = await client.query(
      `INSERT INTO acquisition_cases
         (case_number, project_id, parcel_id, district_id, current_stage, status, risk_level, assigned_officer, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        caseNumber,
        input.projectId,
        input.parcelId,
        input.districtId,
        input.currentStage,
        input.status,
        input.riskLevel,
        input.assignedOfficer,
        createdByUserId,
      ],
    );
    const caseId = rows[0].id as string;

    // Seed the 10-stage pipeline: the current stage in progress, earlier stages completed, later ones not started.
    for (let i = 0; i < PIPELINE_STAGES.length; i++) {
      const stageNumber = i + 1;
      const status =
        stageNumber === input.currentStage ? "in_progress" : stageNumber < input.currentStage ? "completed" : "not_started";
      await client.query(
        `INSERT INTO acquisition_stages (case_id, stage_number, stage_name, status, responsible_department, responsible_officer)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [caseId, stageNumber, PIPELINE_STAGES[i], status, "Not yet assigned", input.assignedOfficer],
      );
    }

    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, new_value) VALUES ($1, $2, $3, $4, $5)`,
      [createdByUserId, "CASE_CREATED", "acquisition_case", caseId, JSON.stringify({ caseNumber })],
    );

    const { rows: caseRows } = await client.query(`${CASE_SELECT} WHERE c.id = $1`, [caseId]);
    return camelCaseKeys(caseRows[0]);
  });
}

export async function updateCase(id: string, input: z.infer<typeof updateCaseSchema>, updatedByUserId: string) {
  return withTransaction(async (client) => {
    const { rows: existingRows } = await client.query(`SELECT * FROM acquisition_cases WHERE id = $1`, [id]);
    const existing = existingRows[0];
    if (!existing) {
      throw new ApiError(404, "CASE_NOT_FOUND", "Acquisition case not found");
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of [
      ["currentStage", "current_stage"],
      ["status", "status"],
      ["riskLevel", "risk_level"],
      ["assignedOfficer", "assigned_officer"],
    ] as const) {
      const value = (input as Record<string, unknown>)[key];
      if (value !== undefined) {
        params.push(value);
        fields.push(`${column} = $${params.length}`);
      }
    }

    if (fields.length > 0) {
      params.push(id);
      await client.query(
        `UPDATE acquisition_cases SET ${fields.join(", ")}, updated_at = now() WHERE id = $${params.length}`,
        params,
      );

      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, previous_value, new_value)
         VALUES ($1, 'CASE_UPDATED', 'acquisition_case', $2, $3, $4)`,
        [updatedByUserId, id, JSON.stringify(existing), JSON.stringify(input)],
      );
    }

    const { rows } = await client.query(`${CASE_SELECT} WHERE c.id = $1`, [id]);
    return camelCaseKeys(rows[0]);
  });
}

const STAGE_SELECT = `
  SELECT id, case_id, stage_number, stage_name, status, start_date, completion_date, due_date,
         responsible_department, responsible_officer, remarks, delay_days
  FROM acquisition_stages
`;

export async function listStagesForCase(caseId: string) {
  await getCaseById(caseId); // 404s if the case doesn't exist
  const { rows } = await pool.query(`${STAGE_SELECT} WHERE case_id = $1 ORDER BY stage_number`, [caseId]);
  return camelCaseRows(rows);
}

export async function updateStage(
  caseId: string,
  stageId: string,
  input: z.infer<typeof updateStageSchema>,
  updatedByUserId: string,
) {
  return withTransaction(async (client) => {
    const { rows: existingRows } = await client.query(
      `SELECT * FROM acquisition_stages WHERE id = $1 AND case_id = $2`,
      [stageId, caseId],
    );
    const existing = existingRows[0];
    if (!existing) {
      throw new ApiError(404, "STAGE_NOT_FOUND", "Stage not found for this case.");
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of [
      ["status", "status"],
      ["startDate", "start_date"],
      ["completionDate", "completion_date"],
      ["dueDate", "due_date"],
      ["remarks", "remarks"],
      ["responsibleOfficer", "responsible_officer"],
      ["delayDays", "delay_days"],
    ] as const) {
      const value = (input as Record<string, unknown>)[key];
      if (value !== undefined) {
        params.push(value);
        fields.push(`${column} = $${params.length}`);
      }
    }

    if (fields.length > 0) {
      params.push(stageId);
      await client.query(`UPDATE acquisition_stages SET ${fields.join(", ")} WHERE id = $${params.length}`, params);

      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, previous_value, new_value)
         VALUES ($1, 'STAGE_UPDATED', 'acquisition_stage', $2, $3, $4)`,
        [updatedByUserId, stageId, JSON.stringify(existing), JSON.stringify(input)],
      );
    }

    const { rows } = await client.query(`${STAGE_SELECT} WHERE id = $1`, [stageId]);
    return camelCaseKeys(rows[0]);
  });
}

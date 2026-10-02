/**
 * Resolution workflow and verified-precedent retrieval.
 *
 * The rule this module exists to enforce: AI never creates institutional
 * knowledge. An officer records what was actually done, a second authorized
 * officer verifies it, and only then does it become retrievable precedent.
 */

import { pool, withTransaction } from "../config/db.js";
import { camelCaseKeys, camelCaseRows } from "../utils/rowMapper.js";
import { ApiError } from "../utils/apiResponse.js";
import { ANALYSIS_VERSION } from "./intelligenceService.js";
import type { CaseResolution, ResolutionStatus, VerifiedPrecedent } from "../types/intelligence.js";
import type { AuthenticatedUser } from "../types/index.js";

/** Roles permitted to record a resolution. */
const RESOLVER_ROLES: AuthenticatedUser["role"][] = [
  "super_admin",
  "dolr_officer",
  "state_officer",
  "district_officer",
];

/**
 * Roles permitted to VERIFY a resolution. Deliberately narrower than the roles
 * that may record one — the recorder must not be able to self-approve their own
 * record into institutional knowledge.
 */
const VERIFIER_ROLES: AuthenticatedUser["role"][] = ["super_admin", "dolr_officer", "state_officer"];

const RESOLUTION_SELECT = `
  SELECT r.id, r.case_id, r.problem_type, r.stage_number, r.problem_description,
         r.root_cause, r.action_taken, r.responsible_department, r.resolution,
         r.outcome, r.resolution_date, r.supporting_document_refs, r.status,
         r.recorded_by, r.verified_by, r.verified_at, r.rejection_reason,
         r.analysis_version, r.created_at, r.updated_at,
         c.case_number,
         ru.name AS recorded_by_name,
         vu.name AS verified_by_name
  FROM case_resolutions r
  JOIN acquisition_cases c ON c.id = r.case_id
  JOIN users ru ON ru.id = r.recorded_by
  LEFT JOIN users vu ON vu.id = r.verified_by
`;

function assertRole(user: AuthenticatedUser, allowed: AuthenticatedUser["role"][], what: string) {
  if (!allowed.includes(user.role)) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      `${what} requires one of: ${allowed.join(", ")}. Your role is ${user.role}.`,
    );
  }
}

export interface CreateResolutionInput {
  problemType: string;
  stageNumber?: number | null;
  problemDescription: string;
  rootCause: string;
  actionTaken: string;
  responsibleDepartment: string;
  resolution: string;
  outcome: string;
  resolutionDate?: string;
  supportingDocumentRefs?: string[];
}

export async function createResolution(
  caseId: string,
  input: CreateResolutionInput,
  user: AuthenticatedUser,
): Promise<CaseResolution> {
  assertRole(user, RESOLVER_ROLES, "Recording a resolution");

  const { rows: caseRows } = await pool.query(`SELECT id FROM acquisition_cases WHERE id = $1`, [caseId]);
  if (!caseRows[0]) {
    throw new ApiError(404, "CASE_NOT_FOUND", "Acquisition case not found");
  }

  // Note: the INSERT and the audit row must commit together, but the read-back
  // must happen AFTER the transaction closes. getResolutionById() uses the pool,
  // which is a different connection and cannot see uncommitted rows.
  const resolutionId = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO case_resolutions
         (case_id, problem_type, stage_number, problem_description, root_cause, action_taken,
          responsible_department, resolution, outcome, resolution_date,
          supporting_document_refs, status, recorded_by, analysis_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::date, CURRENT_DATE),$11::text[],'draft',$12,$13)
       RETURNING id`,
      [
        caseId,
        input.problemType,
        input.stageNumber ?? null,
        input.problemDescription,
        input.rootCause,
        input.actionTaken,
        input.responsibleDepartment,
        input.resolution,
        input.outcome,
        input.resolutionDate ?? null,
        input.supportingDocumentRefs ?? [],
        user.id,
        ANALYSIS_VERSION,
      ],
    );

    const newId: string = rows[0].id;

    await client.query(
      `INSERT INTO intelligence_audit_logs (case_id, user_id, action, analysis_version, detail, resolution_id)
       VALUES ($1,$2,'RESOLUTION_RECORDED',$3,$4,$5)`,
      [
        caseId,
        user.id,
        ANALYSIS_VERSION,
        JSON.stringify({ problemType: input.problemType, status: "draft" }),
        newId,
      ],
    );

    return newId;
  });

  return getResolutionById(resolutionId);
}

export async function getResolutionById(id: string): Promise<CaseResolution> {
  const { rows } = await pool.query(`${RESOLUTION_SELECT} WHERE r.id = $1`, [id]);
  if (!rows[0]) {
    throw new ApiError(404, "RESOLUTION_NOT_FOUND", "Resolution not found");
  }
  return camelCaseKeys(rows[0]) as CaseResolution;
}

export async function listResolutionsForCase(caseId: string): Promise<CaseResolution[]> {
  const { rows } = await pool.query(
    `${RESOLUTION_SELECT} WHERE r.case_id = $1 ORDER BY r.created_at DESC`,
    [caseId],
  );
  return camelCaseRows(rows) as CaseResolution[];
}

const SUBMITTABLE: ResolutionStatus[] = ["draft"];
const REVIEWABLE: ResolutionStatus[] = ["submitted", "under_review"];

export async function submitResolution(
  id: string,
  user: AuthenticatedUser,
): Promise<CaseResolution> {
  assertRole(user, RESOLVER_ROLES, "Submitting a resolution");
  return transition(id, SUBMITTABLE, "submitted", user);
}

export async function startReview(
  id: string,
  user: AuthenticatedUser,
): Promise<CaseResolution> {
  assertRole(user, VERIFIER_ROLES, "Reviewing a resolution");
  return transition(id, REVIEWABLE, "under_review", user);
}

export async function verifyResolution(
  id: string,
  user: AuthenticatedUser,
): Promise<CaseResolution> {
  assertRole(user, VERIFIER_ROLES, "Verifying a resolution");
  return transition(id, REVIEWABLE, "verified", user, { setVerifiedBy: true });
}

export async function rejectResolution(
  id: string,
  reason: string,
  user: AuthenticatedUser,
): Promise<CaseResolution> {
  assertRole(user, VERIFIER_ROLES, "Rejecting a resolution");
  return transition(id, REVIEWABLE, "rejected", user, {
    setVerifiedBy: true,
    extra: { rejection_reason: reason },
  });
}

async function transition(
  id: string,
  allowedFrom: ResolutionStatus[],
  to: ResolutionStatus,
  user: AuthenticatedUser,
  opts: { setVerifiedBy?: boolean; extra?: Record<string, unknown> } = {},
): Promise<CaseResolution> {
  const existing = await getResolutionById(id);

  if (existing.recordedBy === user.id && (to === "verified" || to === "rejected")) {
    throw new ApiError(
      403,
      "SELF_VERIFICATION_FORBIDDEN",
      "A resolution must be verified by a different officer than the one who recorded it.",
    );
  }

  if (!allowedFrom.includes(existing.status)) {
    throw new ApiError(
      409,
      "INVALID_RESOLUTION_TRANSITION",
      `Cannot move a resolution from "${existing.status}" to "${to}". Allowed from: ${allowedFrom.join(", ")}.`,
    );
  }

  await withTransaction(async (client) => {
    const sets: string[] = ["status = $1", "updated_at = now()"];
    const params: unknown[] = [to];

    if (opts.setVerifiedBy) {
      params.push(user.id);
      sets.push(`verified_by = $${params.length}`, "verified_at = now()");
    }
    for (const [column, value] of Object.entries(opts.extra ?? {})) {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }

    params.push(id);
    await client.query(
      `UPDATE case_resolutions SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params,
    );

    await client.query(
      `INSERT INTO intelligence_audit_logs (case_id, user_id, action, analysis_version, detail, resolution_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        existing.caseId,
        user.id,
        `RESOLUTION_${to.toUpperCase()}`,
        ANALYSIS_VERSION,
        JSON.stringify({ from: existing.status, to, problemType: existing.problemType }),
        id,
      ],
    );
  });

  return getResolutionById(id);
}

// ---------------------------------------------------------------------------
// Verified precedent retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieves VERIFIED resolutions similar to the current case.
 *
 * Matching is structured-attribute based (problem type, stage, project). No
 * vector extension exists in this deployment and no similarity percentage is
 * fabricated — the match is reported categorically with the fields that
 * actually matched, so an officer can judge relevance themselves.
 */
export async function findSimilarVerifiedPrecedents(
  caseId: string,
  problemType: string | null,
  limit = 5,
): Promise<VerifiedPrecedent[]> {
  const { rows: caseRows } = await pool.query(
    `SELECT c.id, c.case_number, c.current_stage FROM acquisition_cases c WHERE c.id = $1`,
    [caseId],
  );
  const current = caseRows[0];
  if (!current) return [];

  // Match on the case's current stage, and on the detected problem type when
  // the caller supplied one (i.e. the case has a primary blocker).
  const { rows } = await pool.query(
    `SELECT r.id, r.case_id, r.problem_type, r.stage_number, r.problem_description,
            r.resolution, r.action_taken, r.responsible_department, r.outcome,
            r.resolution_date, r.verified_at,
            c.case_number,
            u.name AS verified_by_name
     FROM case_resolutions r
     JOIN acquisition_cases c ON c.id = r.case_id
     JOIN users u ON u.id = r.verified_by
     WHERE r.status = 'verified'
       AND r.case_id <> $1
       AND (r.stage_number = $2 OR ($3::text IS NOT NULL AND r.problem_type = $3))
     ORDER BY
       ($3::text IS NOT NULL AND r.problem_type = $3) DESC,
       (r.stage_number = $2) DESC,
       r.verified_at DESC NULLS LAST
     LIMIT $4`,
    [caseId, current.current_stage, problemType, limit],
  );

  return rows.map((row) => {
    const matchedOn: string[] = [];

    const sameProblemType = problemType != null && row.problem_type === problemType;
    if (sameProblemType) matchedOn.push(`problem type "${problemType}"`);

    const sameStage = row.stage_number != null && row.stage_number === current.current_stage;
    if (sameStage) matchedOn.push(`stage ${current.current_stage}`);

    const level: VerifiedPrecedent["match"]["level"] =
      matchedOn.length >= 2 ? "high" : matchedOn.length === 1 ? "moderate" : "low";

    return {
      resolutionId: row.id,
      sourceCaseId: row.case_id,
      sourceCaseNumber: row.case_number,
      problemType: row.problem_type,
      stageNumber: row.stage_number,
      problemDescription: row.problem_description,
      resolution: row.resolution,
      actionsTaken: row.action_taken,
      responsibleDepartment: row.responsible_department,
      outcome: row.outcome,
      resolutionDate: String(row.resolution_date).slice(0, 10),
      verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : "",
      verifiedByName: row.verified_by_name,
      match: { level, matchedOn },
    };
  });
}

export async function listVerifiedPrecedents(limit = 50): Promise<VerifiedPrecedent[]> {
  const { rows } = await pool.query(
    `SELECT r.id, r.case_id, r.problem_type, r.stage_number, r.problem_description,
            r.resolution, r.action_taken, r.responsible_department, r.outcome,
            r.resolution_date, r.verified_at,
            c.case_number,
            u.name AS verified_by_name
     FROM case_resolutions r
     JOIN acquisition_cases c ON c.id = r.case_id
     JOIN users u ON u.id = r.verified_by
     WHERE r.status = 'verified'
     ORDER BY r.verified_at DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );

  return rows.map((row) => ({
    resolutionId: row.id,
    sourceCaseId: row.case_id,
    sourceCaseNumber: row.case_number,
    problemType: row.problem_type,
    stageNumber: row.stage_number,
    problemDescription: row.problem_description,
    resolution: row.resolution,
    actionsTaken: row.action_taken,
    responsibleDepartment: row.responsible_department,
    outcome: row.outcome,
    resolutionDate: String(row.resolution_date).slice(0, 10),
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : "",
    verifiedByName: row.verified_by_name,
    match: { level: "low" as const, matchedOn: [] },
  }));
}

import type { Response } from "express";
import {
  createCase,
  getCaseById,
  listCases,
  listStagesForCase,
  updateCase,
  updateStage,
} from "../services/caseService.js";
import { createCaseSchema, updateCaseSchema, updateStageSchema } from "../validators/schemas.js";
import { created, ok, ApiError } from "../utils/apiResponse.js";
import { authorizeCaseAccess, assertCaseWriteAllowed } from "../services/intelligenceAuthz.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

function requireUser(req: AuthenticatedRequest) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  return req.user;
}

/** First value of a query param, when it is a non-empty string. */
function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * GET /api/cases
 *
 * The scope is applied in SQL by listCases. Every authenticated role is now
 * filtered; previously this returned every case in the system to any caller.
 */
export async function getCases(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const cases = await listCases(
    {
      status: queryString(req.query.status),
      riskLevel: queryString(req.query.riskLevel),
      districtId: queryString(req.query.districtId),
      projectId: queryString(req.query.projectId),
      search: queryString(req.query.search),
    },
    user,
  );
  ok(res, cases);
}

/**
 * GET /api/cases/:id
 *
 * Authorization runs BEFORE the case row is loaded for return, so no case field
 * is read out of the database into a response an unauthorized caller could see.
 * 404 for a case that does not exist, 403 for one that exists but is out of
 * scope — the established behaviour in this codebase.
 */
export async function getCase(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const caseId = await authorizeCaseAccess(String(req.params.id), user);
  ok(res, await getCaseById(caseId));
}

/**
 * POST /api/cases
 *
 * The route guard restricts this to officer roles, but the request body supplies
 * `districtId`, so without the write check a district officer could open a case
 * in a district they cannot read — invisible to the district that owns it.
 */
export async function postCase(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const input = createCaseSchema.parse(req.body);
  assertCaseWriteAllowed(user, input.districtId);
  const acquisitionCase = await createCase(input, user.id);
  created(res, acquisitionCase);
}

/**
 * PUT /api/cases/:id
 *
 * The route guard restricts this to officer roles, but a district officer could
 * still write to any case id in the system. Scope is enforced here so a write
 * cannot reach a case outside the caller's district.
 */
export async function putCase(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const caseId = await authorizeCaseAccess(String(req.params.id), user);
  const input = updateCaseSchema.parse(req.body);
  const acquisitionCase = await updateCase(caseId, input, user.id);
  ok(res, acquisitionCase);
}

/**
 * GET /api/cases/:id/stages
 *
 * A Case 360 child: reachable by direct id, so it needs the same check as the
 * case itself. Previously any authenticated role could read the full stage
 * history of any case.
 */
export async function getCaseStages(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const caseId = await authorizeCaseAccess(String(req.params.id), user);
  ok(res, await listStagesForCase(caseId));
}

/** PUT /api/cases/:id/stages/:stageId — see putCase for why the case is re-checked. */
export async function putCaseStage(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const caseId = await authorizeCaseAccess(String(req.params.id), user);
  const input = updateStageSchema.parse(req.body);
  const stage = await updateStage(caseId, String(req.params.stageId), input, user.id);
  ok(res, stage);
}

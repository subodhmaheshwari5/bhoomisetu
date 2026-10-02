import type { Response } from "express";
import { computeAndStoreRiskScore } from "../services/riskEngineService.js";
import { authorizeCaseAccess } from "../services/intelligenceAuthz.js";
import { ok, ApiError } from "../utils/apiResponse.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

/**
 * GET /api/cases/:id/risk-score
 *
 * A Case 360 child. The route guard already restricts this to officer roles, but
 * that is not a scope check: a district officer could read the risk score for
 * any case id. The case is authorized here before any risk data is read.
 */
export async function getCaseRiskScore(req: AuthenticatedRequest, res: Response) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  const caseId = await authorizeCaseAccess(String(req.params.id), req.user);

  const result = await computeAndStoreRiskScore(caseId);
  if (!result) {
    throw new ApiError(404, "CASE_NOT_FOUND", "Acquisition case not found");
  }

  ok(res, {
    ...result,
    disclaimer: "Prototype decision-support risk score based on workflow indicators, not a trained AI model.",
  });
}

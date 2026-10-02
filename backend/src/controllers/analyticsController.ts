import type { Response } from "express";
import {
  getBottleneckAnalytics,
  getCaseStatusBreakdown,
  getDistrictPerformance,
  getStageDistribution,
} from "../services/analyticsService.js";
import { ok, ApiError } from "../utils/apiResponse.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

/**
 * GET /api/analytics — every aggregate is scoped to the caller's visible cases.
 */
export async function getAnalytics(req: AuthenticatedRequest, res: Response) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  const user = req.user;

  const [stageDistribution, districtPerformance, caseStatus, bottlenecks] = await Promise.all([
    getStageDistribution(user),
    getDistrictPerformance(user),
    getCaseStatusBreakdown(user),
    getBottleneckAnalytics(user),
  ]);
  ok(res, { stageDistribution, districtPerformance, caseStatus, bottlenecks });
}

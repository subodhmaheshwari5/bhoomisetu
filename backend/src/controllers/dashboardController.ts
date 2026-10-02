import type { Response } from "express";
import { getKpiSummary, getPriorityAlerts } from "../services/dashboardService.js";
import { ok, ApiError } from "../utils/apiResponse.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

/** GET /api/dashboard — KPIs and alerts, both scoped to the caller's cases. */
export async function getDashboard(req: AuthenticatedRequest, res: Response) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  const [kpi, priorityAlerts] = await Promise.all([
    getKpiSummary(req.user),
    getPriorityAlerts(req.user),
  ]);
  ok(res, { kpi, priorityAlerts });
}

import type { Response } from "express";
import { listCompensation } from "../services/compensationService.js";
import { ok, ApiError } from "../utils/apiResponse.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

/** GET /api/compensation — scoped to the caller's visible cases. */
export async function getCompensation(req: AuthenticatedRequest, res: Response) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  ok(res, await listCompensation(req.user));
}

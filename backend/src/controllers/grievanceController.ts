import type { Response } from "express";
import { createGrievance, listGrievances, updateGrievance } from "../services/grievanceService.js";
import { createGrievanceSchema, updateGrievanceSchema } from "../validators/schemas.js";
import { created, ok, ApiError } from "../utils/apiResponse.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

function requireUser(req: AuthenticatedRequest) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  return req.user;
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** GET /api/grievances — scoped to the caller's visible cases. */
export async function getGrievances(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const grievances = await listGrievances(
    {
      status: queryString(req.query.status),
      category: queryString(req.query.category),
    },
    user,
  );
  ok(res, grievances);
}

export async function postGrievance(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const input = createGrievanceSchema.parse(req.body);
  const grievance = await createGrievance(input, user.id);
  created(res, grievance);
}

export async function putGrievance(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const input = updateGrievanceSchema.parse(req.body);
  const grievance = await updateGrievance(String(req.params.id), input, user.id);
  ok(res, grievance);
}

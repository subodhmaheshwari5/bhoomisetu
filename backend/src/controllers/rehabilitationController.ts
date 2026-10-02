import type { Response } from "express";
import {
  listRehabilitation,
  getRehabilitationSummary,
  REHABILITATION_STATUSES,
  REHABILITATION_STATUS_LABELS,
} from "../services/rehabilitationService.js";
import { rehabilitationQuerySchema } from "../validators/schemas.js";
import { ok, ApiError } from "../utils/apiResponse.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

function requireUser(req: AuthenticatedRequest) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  return req.user;
}

/** GET /api/rehabilitation — R&R records, scoped to the caller's visible cases. */
export async function getRehabilitation(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);

  const parsed = rehabilitationQuerySchema.safeParse({
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    caseId: typeof req.query.caseId === "string" ? req.query.caseId : undefined,
    search: typeof req.query.search === "string" ? req.query.search : undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(
      400,
      "INVALID_REHABILITATION_QUERY",
      issue.path[0] === "status"
        ? `status must be one of: ${REHABILITATION_STATUSES.join(", ")}.`
        : issue.message,
    );
  }

  const rows = await listRehabilitation(parsed.data, user);
  ok(res, rows);
}

/** GET /api/rehabilitation/summary — status totals within the caller's scope. */
export async function getRehabilitationSummaryHandler(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  ok(res, await getRehabilitationSummary(user));
}

/**
 * GET /api/rehabilitation/statuses
 *
 * The closed set of R&R statuses, so the client filter menu cannot drift from
 * the values the backend actually stores.
 */
export async function getRehabilitationStatuses(_req: AuthenticatedRequest, res: Response) {
  ok(res, {
    statuses: REHABILITATION_STATUSES.map((value) => ({ value, label: REHABILITATION_STATUS_LABELS[value] })),
  });
}

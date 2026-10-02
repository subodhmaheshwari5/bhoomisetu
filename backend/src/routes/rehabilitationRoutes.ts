import { Router } from "express";
import {
  getRehabilitation,
  getRehabilitationSummaryHandler,
  getRehabilitationStatuses,
} from "../controllers/rehabilitationController.js";

/**
 * Rehabilitation & Resettlement routes, mounted at /api/rehabilitation.
 *
 * requireAuth is applied by the parent router (routes/index.ts). Row-level
 * scoping lives in the service, because it depends on the caller's role and
 * district rather than on a static route guard.
 *
 * Fixed paths are registered before the list route so they cannot be shadowed.
 */
export const rehabilitationRoutes = Router();

rehabilitationRoutes.get("/statuses", getRehabilitationStatuses);
rehabilitationRoutes.get("/summary", getRehabilitationSummaryHandler);
rehabilitationRoutes.get("/", getRehabilitation);

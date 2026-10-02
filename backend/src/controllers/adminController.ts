import type { Request, Response } from "express";
import { runAlertScan } from "../services/alertEngineService.js";
import {
  listUsers,
  listStates,
  listDistricts,
  listSettings,
  updateSetting,
  listAuditLogs,
  listAuditFacets,
} from "../services/adminService.js";
import { ok, ApiError } from "../utils/apiResponse.js";
import { updateSettingSchema, auditQuerySchema } from "../validators/schemas.js";

function requireUser(req: Request) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  return req.user;
}

export async function postRunAlertScan(_req: Request, res: Response) {
  const result = await runAlertScan();
  ok(res, result);
}

/** GET /api/admin/users — accounts, roles, and district assignment. */
export async function getUsers(req: Request, res: Response) {
  requireUser(req);
  ok(res, await listUsers());
}

/** GET /api/admin/states — states with their district counts. */
export async function getStates(req: Request, res: Response) {
  requireUser(req);
  ok(res, await listStates());
}

/** GET /api/admin/districts — districts with case and project counts. */
export async function getDistricts(req: Request, res: Response) {
  requireUser(req);
  ok(res, await listDistricts());
}

/** GET /api/admin/settings — configuration, with secret values masked. */
export async function getSettings(req: Request, res: Response) {
  requireUser(req);
  ok(res, await listSettings());
}

/** PATCH /api/admin/settings/:key — update one non-secret setting. */
export async function patchSetting(req: Request, res: Response) {
  const user = requireUser(req);
  const { value } = updateSettingSchema.parse(req.body ?? {});
  // Express types a path parameter as string | string[] under some router
  // configurations; a repeated parameter cannot select a single setting key.
  const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  if (!key) throw new ApiError(400, "INVALID_SETTING_KEY", "A setting key is required.");
  const updated = await updateSetting(key, value, user.id);
  if (!updated) throw new ApiError(404, "SETTING_NOT_FOUND", "No such setting.");
  ok(res, updated);
}

/** GET /api/admin/audit-logs — paginated audit trail. */
export async function getAuditLogs(req: Request, res: Response) {
  requireUser(req);
  const query = auditQuerySchema.parse(req.query);
  ok(res, await listAuditLogs(query));
}

/** GET /api/admin/audit-logs/facets — distinct entities and actions. */
export async function getAuditFacets(req: Request, res: Response) {
  requireUser(req);
  ok(res, await listAuditFacets());
}

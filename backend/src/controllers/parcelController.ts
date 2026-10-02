import type { Response } from "express";
import { getParcelByUlpin, listParcels } from "../services/parcelService.js";
import { ulpinParamSchema } from "../validators/schemas.js";
import { ok, ApiError } from "../utils/apiResponse.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

function requireUser(req: AuthenticatedRequest) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  return req.user;
}

/** GET /api/parcels — scoped to the caller's district/holdings. */
export async function getParcels(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const { districtId } = req.query;
  const parcels = await listParcels(
    typeof districtId === "string" && districtId.length > 0 ? districtId : undefined,
    user,
  );
  ok(res, parcels);
}

/**
 * GET /api/parcels/:ulpin
 *
 * Returns 404 for a parcel outside the caller's scope, so an out-of-scope ULPIN
 * cannot be distinguished from a non-existent one.
 */
export async function getParcelByUlpinParam(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const ulpin = ulpinParamSchema.parse(req.params.ulpin);
  const parcel = await getParcelByUlpin(ulpin, user);
  ok(res, parcel);
}

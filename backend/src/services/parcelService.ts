import { pool } from "../config/db.js";
import { camelCaseRows, camelCaseKeys } from "../utils/rowMapper.js";
import { ApiError } from "../utils/apiResponse.js";
import { applyParcelScope } from "./intelligenceAuthz.js";
import type { AuthenticatedUser } from "../types/index.js";

const PARCEL_SELECT = `
  SELECT
    p.id,
    p.ulpin,
    p.district_id,
    d.name AS district_name,
    d.state_name,
    p.area_hectares,
    p.land_use,
    lo.landowner_ref,
    ST_AsGeoJSON(p.centroid)::json AS centroid,
    ST_AsGeoJSON(p.boundary)::json AS boundary,
    p.created_at,
    p.updated_at
  FROM land_parcels p
  JOIN districts d ON d.id = p.district_id
  LEFT JOIN landowners lo ON lo.id = p.landowner_id
`;

/**
 * Lists parcels visible to the caller.
 *
 * Scoped with `applyParcelScope`, the same model the case list uses: a
 * district-scoped officer sees their district, a landowner their own holdings,
 * land agencies nothing. The optional `districtId` filter is ANDed with the
 * scope, so it can only narrow what the caller may already see — passing another
 * district's id yields an empty result rather than that district's parcels.
 */
export async function listParcels(districtId: string | undefined, user: AuthenticatedUser) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  applyParcelScope(clauses, params, user, "p");

  if (districtId) {
    params.push(districtId);
    clauses.push(`p.district_id = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(`${PARCEL_SELECT} ${where} ORDER BY p.ulpin`, params);
  return camelCaseRows(rows);
}

/**
 * Fetches one parcel by ULPIN, scoped to the caller.
 *
 * An out-of-scope ULPIN returns 404, not 403. A 403 would confirm the ULPIN
 * exists, turning this endpoint into an oracle for enumerating land records by
 * guessing identifiers — which is exactly what the scope is meant to prevent.
 */
export async function getParcelByUlpin(ulpin: string, user: AuthenticatedUser) {
  const clauses: string[] = ["p.ulpin = $1"];
  const params: unknown[] = [ulpin];
  applyParcelScope(clauses, params, user, "p");

  const { rows } = await pool.query(
    `${PARCEL_SELECT} WHERE ${clauses.join(" AND ")}`,
    params,
  );
  if (!rows[0]) {
    throw new ApiError(404, "PARCEL_NOT_FOUND", `No parcel found with ULPIN ${ulpin}.`);
  }
  return camelCaseKeys(rows[0]);
}

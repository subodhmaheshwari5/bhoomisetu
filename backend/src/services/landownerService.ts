import { pool } from "../config/db.js";
import { camelCaseRows } from "../utils/rowMapper.js";

const PARCEL_SELECT = `
  SELECT
    p.id, p.ulpin, p.district_id, d.name AS district_name, d.state_name,
    p.area_hectares, p.land_use, lo.landowner_ref,
    ST_AsGeoJSON(p.centroid)::json AS centroid,
    ST_AsGeoJSON(p.boundary)::json AS boundary,
    p.created_at, p.updated_at
  FROM land_parcels p
  JOIN districts d ON d.id = p.district_id
  JOIN landowners lo ON lo.id = p.landowner_id
`;

const CASE_SELECT = `
  SELECT
    c.id, c.case_number, c.project_id, pr.name AS project_name, pr.agency,
    c.parcel_id, lp.ulpin,
    c.district_id, d.name AS district_name, d.state_name,
    c.current_stage, c.status, c.risk_level, c.assigned_officer,
    c.created_at, c.updated_at
  FROM acquisition_cases c
  JOIN projects pr ON pr.id = c.project_id
  JOIN land_parcels lp ON lp.id = c.parcel_id
  JOIN districts d ON d.id = c.district_id
`;

/** Finds the landowner record linked to a login account, if any. */
async function landownerIdForUser(userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM landowners WHERE user_id = $1`, [userId]);
  return rows[0]?.id ?? null;
}

export async function getMyParcels(userId: string) {
  const landownerId = await landownerIdForUser(userId);
  if (!landownerId) return [];
  const { rows } = await pool.query(`${PARCEL_SELECT} WHERE p.landowner_id = $1 ORDER BY p.ulpin`, [landownerId]);
  return camelCaseRows(rows);
}

export async function getMyCases(userId: string) {
  const landownerId = await landownerIdForUser(userId);
  if (!landownerId) return [];
  const { rows } = await pool.query(
    `${CASE_SELECT} WHERE c.parcel_id IN (SELECT id FROM land_parcels WHERE landowner_id = $1) ORDER BY c.updated_at DESC`,
    [landownerId],
  );
  return camelCaseRows(rows);
}

export async function getMyCompensation(userId: string) {
  const landownerId = await landownerIdForUser(userId);
  if (!landownerId) return [];
  const { rows } = await pool.query(
    `SELECT comp.id, comp.case_id, c.case_number, comp.assessment_amount, comp.approval_status,
            comp.disbursement_status, comp.payment_date, comp.payment_reference, comp.updated_at
     FROM compensation comp
     JOIN acquisition_cases c ON c.id = comp.case_id
     WHERE c.parcel_id IN (SELECT id FROM land_parcels WHERE landowner_id = $1)
     ORDER BY comp.updated_at DESC`,
    [landownerId],
  );
  return camelCaseRows(rows);
}

export async function getMyGrievances(userId: string) {
  const landownerId = await landownerIdForUser(userId);
  if (!landownerId) return [];
  const { rows } = await pool.query(
    `SELECT g.id, g.grievance_number, g.case_id, c.case_number, g.category, g.description,
            g.status, g.assigned_officer, g.resolution, g.created_at, g.updated_at
     FROM grievances g
     LEFT JOIN acquisition_cases c ON c.id = g.case_id
     WHERE g.landowner_id = $1
     ORDER BY g.created_at DESC`,
    [landownerId],
  );
  return camelCaseRows(rows);
}

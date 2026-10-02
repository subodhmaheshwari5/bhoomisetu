import { pool } from "../config/db.js";
import { camelCaseRows } from "../utils/rowMapper.js";

export async function listProjects() {
  const { rows } = await pool.query(`
    SELECT p.id, p.name, p.agency, p.district_id, d.name AS district_name, d.state_name, p.created_at
    FROM projects p
    JOIN districts d ON d.id = p.district_id
    ORDER BY p.name
  `);
  return camelCaseRows(rows);
}

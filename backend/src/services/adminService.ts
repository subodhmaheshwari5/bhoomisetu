import { pool } from "../config/db.js";
import { camelCaseRows } from "../utils/rowMapper.js";
import { ApiError } from "../utils/apiResponse.js";

/**
 * Administrative reference data and system configuration.
 *
 * Every function here is reached only through adminRoutes, which is gated by
 * requireRole("super_admin", "dolr_officer"). The service still takes care not to
 * select or return secrets, because a query that would leak them is one careless
 * column-list change away from doing so.
 */

/**
 * User accounts for the administration screen.
 *
 * `password_hash` is never selected. This is deliberate rather than filtered in
 * the controller: the column is absent from the query, so it cannot be returned
 * even by accident, and no caller has to remember to strip it.
 */
export async function listUsers() {
  const { rows } = await pool.query(`
    SELECT u.id, u.name, u.email, u.role, u.district_id, d.name AS district_name,
           u.created_at
    FROM users u
    LEFT JOIN districts d ON d.id = u.district_id
    ORDER BY u.role, u.name
  `);
  return camelCaseRows(rows);
}

/**
 * States with a count of their districts.
 *
 * The district count comes from a LEFT JOIN so a state with no districts is
 * still listed — a state that has been created but not yet populated is a fact
 * an administrator needs to see, not an absence to hide.
 */
export async function listStates() {
  const { rows } = await pool.query(`
    SELECT s.id, s.name, s.code, s.region, s.status, s.created_at,
           count(d.id)::int AS district_count
    FROM states s
    LEFT JOIN districts d ON d.state_id = s.id
    GROUP BY s.id, s.name, s.code, s.region, s.status, s.created_at
    ORDER BY s.name
  `);
  return camelCaseRows(rows);
}

/**
 * Districts with counts of the cases and projects inside them.
 *
 * These counts are what make the screen useful for spotting an unbalanced
 * district, so they are computed in the database rather than by the client
 * counting rows.
 */
export async function listDistricts() {
  const { rows } = await pool.query(`
    SELECT d.id, d.name, d.state_name, d.code, d.is_active, d.state_id,
           s.name AS state,
           count(DISTINCT c.id)::int AS case_count,
           count(DISTINCT p.id)::int AS project_count
    FROM districts d
    LEFT JOIN states s ON s.id = d.state_id
    LEFT JOIN acquisition_cases c ON c.district_id = d.id
    LEFT JOIN projects p ON p.district_id = d.id
    GROUP BY d.id, d.name, d.state_name, d.code, d.is_active, d.state_id, s.name
    ORDER BY d.state_name, d.name
  `);
  return camelCaseRows(rows);
}

/**
 * System settings grouped by category.
 *
 * A secret setting's value is replaced with a placeholder rather than omitted, so
 * the administrator can see that a key is configured without the payload
 * disclosing it. The real value is never sent to the client, which also means the
 * GET endpoint cannot be used to read credentials back out.
 */
export async function listSettings() {
  const { rows } = await pool.query(`
    SELECT s.key, s.value, s.category, s.description, s.is_secret, s.updated_at,
           u.name AS updated_by_name
    FROM system_settings s
    LEFT JOIN users u ON u.id = s.updated_by
    ORDER BY s.category, s.key
  `);

  return camelCaseRows(rows).map((row) => ({
    ...row,
    value: row.isSecret ? "••••••••" : row.value,
  }));
}

/**
 * Updates one system setting.
 *
 * Refuses to write a secret setting: the value cannot be read back through
 * listSettings, so accepting a write would replace it with something no
 * administrator can verify. Secrets belong in configuration, not in this table.
 */
export async function updateSetting(key: string, value: unknown, updatedBy: string) {
  const { rows } = await pool.query<{ is_secret: boolean; value: unknown }>(
    "SELECT is_secret, value FROM system_settings WHERE key = $1",
    [key],
  );
  const existing = rows[0];
  if (!existing) return null;
  if (existing.is_secret) {
    throw new ApiError(
      400,
      "SECRET_SETTING_READONLY",
      "Secret settings cannot be updated through the API. Update them through deployment configuration.",
    );
  }

  const { rows: updated } = await pool.query(`
    UPDATE system_settings
    SET value = $2::jsonb, updated_by = $3, updated_at = now()
    WHERE key = $1
    RETURNING key, value, category, description, is_secret, updated_at
  `, [key, JSON.stringify(value ?? null), updatedBy]);

  // The before and after values are recorded verbatim. This is reached only
  // after the secret check above has rejected secret settings, so there is no
  // secret here to protect — and redacting every value would leave an audit
  // trail that cannot answer what an ordinary setting actually changed to.
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, previous_value, new_value)
     VALUES ($1, 'UPDATE_SETTING', 'system_settings', $2, $3::jsonb, $4::jsonb)`,
    [
      updatedBy,
      key,
      JSON.stringify({ value: existing.value ?? null }),
      JSON.stringify({ value: value ?? null }),
    ],
  );

  // Camel-cased so the response matches every other endpoint in the API.
  const [row] = camelCaseRows(updated);
  return row ?? null;
}

export interface AuditLogFilters {
  limit: number;
  offset: number;
  entity?: string;
  action?: string;
}

/**
 * Audit log entries, newest first.
 *
 * `previous_value` and `new_value` are returned as stored so an administrator can
 * see what changed, but they are deliberately not interpreted here.
 */
export async function listAuditLogs(filters: AuditLogFilters) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.entity) {
    params.push(filters.entity);
    clauses.push(`a.entity = $${params.length}`);
  }
  if (filters.action) {
    params.push(filters.action);
    clauses.push(`a.action = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const countResult = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM audit_logs a ${where}`,
    params,
  );
  const total = Number(countResult.rows[0].total);

  params.push(filters.limit, filters.offset);
  const { rows } = await pool.query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.previous_value, a.new_value,
            a.created_at, u.name AS user_name, u.role AS user_role
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    total,
    limit: filters.limit,
    offset: filters.offset,
    entries: camelCaseRows(rows),
  };
}

/** Distinct entities and actions present in the log, for populating filters. */
export async function listAuditFacets() {
  const { rows } = await pool.query(`
    SELECT 'entity' AS kind, entity AS value, count(*)::int AS count FROM audit_logs GROUP BY entity
    UNION ALL
    SELECT 'action' AS kind, action AS value, count(*)::int AS count FROM audit_logs GROUP BY action
    ORDER BY kind, count DESC, value
  `);
  return camelCaseRows(rows);
}

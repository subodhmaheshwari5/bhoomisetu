import { pool } from "../config/db.js";
import { camelCaseRows } from "../utils/rowMapper.js";
import { applyCaseScope } from "./intelligenceAuthz.js";
import type { AuthenticatedUser } from "../types/index.js";

/** Cap on rows returned per request so one page can't pull the whole table. */
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 200;

export async function listDocumentsForCase(caseId: string) {
  const { rows } = await pool.query(
    `SELECT id, case_id, document_type AS category, file_name, storage_path, uploaded_by,
            verification_status AS status, created_at AS uploaded_at
     FROM documents
     WHERE case_id = $1
     ORDER BY created_at`,
    [caseId],
  );
  return camelCaseRows(rows);
}

export interface DocumentFilters {
  status?: string;
  category?: string;
  caseId?: string;
  search?: string;
  limit?: number;
}

/**
 * Lists documents across cases, scoped to what the caller may see.
 *
 * Returns the current state of each document plus its version count, so the list
 * can render "v3" without a second round trip per row.
 *
 * The scope predicate is pushed into the WHERE clause rather than applied
 * afterwards in JavaScript: filtering after the fetch would still pull every row
 * into this process, and makes it far too easy to leak a total or a page that
 * reveals out-of-scope records. The scope comes from the shared
 * `applyCaseScope`, so documents and cases cannot drift apart.
 */
export async function listDocuments(filters: DocumentFilters, user: AuthenticatedUser) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  applyCaseScope(clauses, params, user, "c");

  if (filters.status) {
    params.push(filters.status);
    clauses.push(`d.verification_status = $${params.length}`);
  }
  if (filters.category) {
    params.push(filters.category);
    clauses.push(`d.document_type = $${params.length}`);
  }
  if (filters.caseId) {
    params.push(filters.caseId);
    clauses.push(`d.case_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    clauses.push(
      `(d.file_name ILIKE $${params.length} OR d.document_type ILIKE $${params.length}
        OR c.case_number ILIKE $${params.length} OR COALESCE(d.document_ref, '') ILIKE $${params.length})`,
    );
  }

  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  params.push(limit);

  // Unscoped roles (super_admin, dolr_officer, state_officer, state_admin) add
  // no scope clause, so the WHERE keyword must be omitted entirely — emitting a
  // bare "WHERE" before ORDER BY is a syntax error, not a broader result set.
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT d.id, d.document_ref, d.case_id, c.case_number,
            dist.name AS district_name,
            d.document_type AS category, d.file_name, d.storage_path,
            d.uploaded_by, d.verification_status AS status,
            d.current_version, d.created_at AS uploaded_at,
            (SELECT count(*)::int FROM document_versions v WHERE v.document_id = d.id) AS version_count
     FROM documents d
     JOIN acquisition_cases c ON c.id = d.case_id
     JOIN districts dist ON dist.id = c.district_id
     ${where}
     ORDER BY d.created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  return camelCaseRows(rows);
}

/** Document categories present in the caller's scope, with counts, for filter menus. */
export async function listDocumentCategories(user: AuthenticatedUser) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  applyCaseScope(clauses, params, user, "c");
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT d.document_type AS category, count(*)::int AS count
     FROM documents d
     JOIN acquisition_cases c ON c.id = d.case_id
     ${where}
     GROUP BY d.document_type
     ORDER BY d.document_type`,
    params,
  );

  return camelCaseRows(rows);
}

/**
 * Case-level authorization for the Acquisition Intelligence Engine, and the
 * single shared scope model for every case-derived read in the API.
 *
 * The existing codebase only enforced district scoping in the AI chat path, and
 * even there `districtId` was never populated. This module centralizes the rule
 * so every case-facing endpoint inherits the same check, and applies it to the
 * *specific case* rather than trusting a client-supplied id.
 *
 * Access model (documented rather than implied):
 *   super_admin, dolr_officer   -> all cases
 *   state_officer               -> all cases (prototype; no state_id on user)
 *   district_officer            -> cases in users.district_id
 *   land_agency                 -> cases whose project agency is theirs
 *   landowner                   -> cases on parcels they own
 *
 * Two additions were required to make this usable as the shared model:
 *
 * 1. `caseScopeFor` / `applyCaseScope` express the same rules as reusable SQL
 *    predicates, so a *list* of cases is scoped in the database rather than
 *    filtered in application memory. `authorizeCaseAccess` is now expressed in
 *    terms of them, so the single-case and list paths cannot drift apart.
 *
 * 2. The nine operational roles added alongside the original six
 *    (state_admin, district_admin, project_officer, field_officer,
 *    compensation_officer, rr_officer, document_officer, grievance_officer,
 *    viewer) are classified below. They were previously invisible to this
 *    module, which meant they were refused case intelligence with a 403 while
 *    simultaneously receiving *every* case from the unscoped GET /cases. That
 *    was inconsistent, and it is not a behaviour worth preserving. They are
 *    government roles, seeded with a district, so they are scoped exactly as
 *    their original-six equivalents are.
 *
 * LAND AGENCY remains denied, matching the pre-existing intelligence rule.
 * `users` has no agency column and `projects.agency` is a free-text name, so
 * there is no reliable user-to-agency relationship to scope against; granting
 * access would mean guessing by string match on a display name. See the
 * security report for the schema change that would be required first.
 */

import { pool } from "../config/db.js";
import { ApiError } from "../utils/apiResponse.js";
import type { AuthenticatedUser, UserRole } from "../types/index.js";

const OFFICER_ROLES: AuthenticatedUser["role"][] = [
  "super_admin",
  "dolr_officer",
  "state_officer",
  "district_officer",
];

/**
 * Government roles that may read cases nationwide. The original three officers
 * plus `state_admin`, which is the state-level counterpart of `state_officer`.
 */
const UNRESTRICTED_ROLES: UserRole[] = [
  "super_admin",
  "dolr_officer",
  "state_officer",
  "state_admin",
];

/**
 * Government roles whose visibility is bounded by their assigned district. The
 * original `district_officer` plus the operational roles seeded with a district.
 */
const DISTRICT_SCOPED_ROLES: UserRole[] = [
  "district_officer",
  "district_admin",
  "project_officer",
  "field_officer",
  "compensation_officer",
  "rr_officer",
  "document_officer",
  "grievance_officer",
  "viewer",
];

/**
 * The visibility scope a user has over acquisition cases.
 *
 * `kind: "denied"` is returned rather than throwing so callers can decide how to
 * surface the refusal; `applyCaseScope` throws for them.
 */
export type CaseScope =
  | { kind: "unrestricted" }
  | { kind: "district"; districtId: string }
  | { kind: "parcels"; userId: string }
  | { kind: "denied"; reason: string };

/**
 * Resolves the caller's case visibility.
 *
 * District-scoped roles FAIL CLOSED: a district role with no district on record
 * is denied outright rather than treated as unrestricted. An earlier version of
 * this check silently fell through to "allow" when `districtId` was missing,
 * which disabled the district check entirely.
 */
export function caseScopeFor(user: AuthenticatedUser): CaseScope {
  if (UNRESTRICTED_ROLES.includes(user.role)) {
    return { kind: "unrestricted" };
  }

  if (DISTRICT_SCOPED_ROLES.includes(user.role)) {
    if (!user.districtId) {
      return {
        kind: "denied",
        reason:
          "Your account is not assigned to a district, so case-level access cannot be granted.",
      };
    }
    return { kind: "district", districtId: user.districtId };
  }

  if (user.role === "landowner") {
    return { kind: "parcels", userId: user.id };
  }

  if (user.role === "land_agency") {
    return {
      kind: "denied",
      reason: "Land-requiring agency accounts cannot access acquisition case data.",
    };
  }

  return { kind: "denied", reason: "You are not authorized to view acquisition cases." };
}

/**
 * Appends the caller's scope to a WHERE clause as bound parameters.
 *
 * `caseAlias` is the SQL alias for acquisition_cases in the caller's query. Every
 * value is passed as a bound parameter ($n) — never interpolated — and combined
 * with AND so a caller-supplied filter can never widen or negate the scope.
 *
 * Pushes nothing for unrestricted roles, so the caller must omit the WHERE
 * keyword entirely when the resulting clause list is empty.
 */
export function applyCaseScope(
  clauses: string[],
  params: unknown[],
  user: AuthenticatedUser,
  caseAlias = "c",
): void {
  const scope = caseScopeFor(user);

  switch (scope.kind) {
    case "unrestricted":
      return;

    case "district":
      params.push(scope.districtId);
      clauses.push(`${caseAlias}.district_id = $${params.length}`);
      return;

    case "parcels":
      // The real ownership path is users -> landowners.user_id ->
      // land_parcels.landowner_id -> acquisition_cases.parcel_id. There is no
      // owner column on the case itself.
      params.push(scope.userId);
      clauses.push(
        `EXISTS (SELECT 1 FROM land_parcels lp
                 JOIN landowners lo ON lo.id = lp.landowner_id
                 WHERE lp.id = ${caseAlias}.parcel_id AND lo.user_id = $${params.length})`,
      );
      return;

    case "denied":
      throw new ApiError(403, "FORBIDDEN", scope.reason);
  }
}

/** True when the caller may see every case (used by aggregate endpoints). */
export function hasUnrestrictedCaseScope(user: AuthenticatedUser): boolean {
  return caseScopeFor(user).kind === "unrestricted";
}

/**
 * Guards a write whose target district is supplied by the caller.
 *
 * `POST /cases` takes `districtId` from the request body. Without this check a
 * district officer could open a case inside a district they cannot even read,
 * which then becomes invisible to the district that owns it. The scope applies
 * to reads only unless a write is checked too.
 *
 * Unrestricted callers may write to any district; a landowner is refused, since
 * they do not open cases.
 */
export function assertCaseWriteAllowed(user: AuthenticatedUser, districtId: string): void {
  const scope = caseScopeFor(user);

  switch (scope.kind) {
    case "unrestricted":
      return;
    case "district":
      if (scope.districtId !== districtId) {
        throw new ApiError(
          403,
          "FORBIDDEN",
          "You can only open cases in your own district.",
        );
      }
      return;
    case "denied":
      throw new ApiError(403, "FORBIDDEN", scope.reason);
    case "parcels":
      throw new ApiError(403, "FORBIDDEN", "Landowners cannot open acquisition cases.");
  }
}

/**
 * The same scope, expressed against the `land_parcels` alias.
 *
 * Shares `caseScopeFor`, so the parcel register and the case list can never
 * disagree about who is a district officer or a landowner. Only the projection
 * differs: a district-scoped caller is bounded by the parcel's own district,
 * while a landowner is bounded by the landowner link on the parcel row itself.
 */
export function applyParcelScope(
  clauses: string[],
  params: unknown[],
  user: AuthenticatedUser,
  parcelAlias = "p",
): void {
  const scope = caseScopeFor(user);

  switch (scope.kind) {
    case "unrestricted":
      return;

    case "district":
      params.push(scope.districtId);
      clauses.push(`${parcelAlias}.district_id = $${params.length}`);
      return;

    case "parcels":
      params.push(scope.userId);
      clauses.push(
        `${parcelAlias}.landowner_id IN (SELECT lo.id FROM landowners lo WHERE lo.user_id = $${params.length})`,
      );
      return;

    case "denied":
      throw new ApiError(403, "FORBIDDEN", scope.reason);
  }
}

/**
 * Verifies the user may access this case, and returns its id.
 *
 * Throws 404 when the case does not exist and 403 when it exists but is out of
 * scope. Deliberately returns 404 (not 403) for a non-existent case so the
 * endpoint cannot be used to probe which case ids are real.
 *
 * Now expressed on top of `caseScopeFor`, so the single-case path and the list
 * path cannot disagree about who may see what.
 */
export async function authorizeCaseAccess(
  caseId: string,
  user: AuthenticatedUser,
): Promise<string> {
  const { rows } = await pool.query(
    `SELECT c.id, c.district_id, c.project_id, p.agency, lp.landowner_id, lo.user_id AS landowner_user_id
     FROM acquisition_cases c
     JOIN projects p ON p.id = c.project_id
     JOIN land_parcels lp ON lp.id = c.parcel_id
     LEFT JOIN landowners lo ON lo.id = lp.landowner_id
     WHERE c.id = $1`,
    [caseId],
  );

  const row = rows[0];
  if (!row) {
    throw new ApiError(404, "CASE_NOT_FOUND", "Acquisition case not found");
  }

  const scope = caseScopeFor(user);

  switch (scope.kind) {
    case "unrestricted":
      return row.id;

    case "district":
      if (row.district_id !== scope.districtId) {
        throw new ApiError(403, "FORBIDDEN", "This case belongs to another district.");
      }
      return row.id;

    case "parcels":
      if (row.landowner_user_id !== scope.userId) {
        throw new ApiError(403, "FORBIDDEN", "You do not own the parcel in this case.");
      }
      return row.id;

    case "denied":
      throw new ApiError(403, "FORBIDDEN", scope.reason);
  }
}

/** True when the user holds an officer role (used to gate write actions). */
export function isOfficer(user: AuthenticatedUser): boolean {
  return OFFICER_ROLES.includes(user.role);
}

/**
 * Landowners see a redacted analysis: no financial amounts, no responsible
 * department or officer names, no internal evidence rows.
 */
/**
 * Evidence column names that reveal a financial fact to a landowner.
 *
 * The redaction below strips the observed VALUE but deliberately keeps the column
 * name, because naming the source is what makes a claim auditable. That is sound
 * for a column like `verification_status` but not for a financial one: the name
 * `assessment_amount` itself discloses that a valuation exists, which is
 * information a landowner is not entitled to.
 */
const FINANCIAL_EVIDENCE_FIELD = /amount|payment|value|price|valuation|disburs/i;

export function redactForLandowner<T>(analysis: T, user: AuthenticatedUser): T {
  if (user.role !== "landowner") return analysis;

  const clone = JSON.parse(JSON.stringify(analysis)) as Record<string, any>;

  if (clone.risk) clone.risk.reasons = [];
  if (clone.recommendations) {
    clone.recommendations = (clone.recommendations as Array<Record<string, unknown>>).map(
      (r: Record<string, unknown>) => ({ ...r, responsibleRole: "Authorized Officer" }),
    );
  }
  if (Array.isArray(clone.evidence)) {
    // Built key by key rather than with `...e`. Spreading the original row
    // re-copied `observed` — the field holding the actual figures — so the
    // redaction silently did nothing and a landowner received valuation amounts
    // whenever their case had compensation evidence. An allow-list is the only
    // shape that cannot leak when a new evidence field is added later.
    clone.evidence = (clone.evidence as Array<Record<string, unknown>>).map((e) => ({
      id: e.id,
      source: e.source,
      field: typeof e.field === "string" && FINANCIAL_EVIDENCE_FIELD.test(e.field) ? "withheld" : e.field,
      supports: e.supports,
    }));
  }
  // A title or detail outside the evidence array can still name a financial
  // column, so scrub any remaining `field` keys throughout the payload.
  const scrubFields = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(scrubFields);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "field" && typeof value === "string" && FINANCIAL_EVIDENCE_FIELD.test(value)) {
        (node as Record<string, unknown>).field = "withheld";
        continue;
      }
      scrubFields(value);
    }
  };
  scrubFields(clone);

  if (clone.projectAgency) delete clone.projectAgency;
  if (clone.landownerName) delete clone.landownerName;

  return clone as T;
}

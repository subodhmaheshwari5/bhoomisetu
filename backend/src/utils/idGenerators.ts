import type { PoolClient } from "pg";

/**
 * Advisory-lock keys.
 *
 * The case and grievance numbers are derived from a running count, so two
 * concurrent creations can read the same count and compute the same number; the
 * second INSERT then fails on the unique constraint. That is a real failure, not
 * just a test artefact — two officers filing a case at the same moment would
 * lose one of the two requests.
 *
 * A transaction-scoped advisory lock serializes only the allocation step (two
 * statements), so contention is negligible while the collision becomes
 * impossible. `pg_advisory_xact_lock` releases automatically at COMMIT or
 * ROLLBACK, so a crashed transaction cannot leave a lock behind.
 *
 * These values are arbitrary but must stay stable and distinct per sequence.
 */
const CASE_NUMBER_LOCK = 918_271;
const GRIEVANCE_NUMBER_LOCK = 918_272;

/** BS-{YEAR}-{5-digit sequence}, per section 66 of the brief. */
export async function nextCaseNumber(client: PoolClient): Promise<string> {
  const year = new Date().getFullYear();
  await client.query(`SELECT pg_advisory_xact_lock($1)`, [CASE_NUMBER_LOCK]);
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM acquisition_cases WHERE case_number LIKE $1`,
    [`BS-${year}-%`],
  );
  const nextSeq = Number(rows[0].count) + 1;
  return `BS-${year}-${String(nextSeq).padStart(5, "0")}`;
}

/** GRV-{YEAR}-{4-digit sequence}, per section 24 of the brief. */
export async function nextGrievanceNumber(client: PoolClient): Promise<string> {
  const year = new Date().getFullYear();
  await client.query(`SELECT pg_advisory_xact_lock($1)`, [GRIEVANCE_NUMBER_LOCK]);
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM grievances WHERE grievance_number LIKE $1`,
    [`GRV-${year}-%`],
  );
  const nextSeq = Number(rows[0].count) + 1;
  return `GRV-${year}-${String(nextSeq).padStart(4, "0")}`;
}

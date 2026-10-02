import { Pool } from "pg";
import { resolvedDatabaseUrl, resolvedSearchSchema } from "./env.js";

export const pool = new Pool({
  connectionString: resolvedDatabaseUrl,
  // Pins the test run to its own schema. `public` is kept on the path so PostGIS
  // types and functions stay resolvable.
  ...(resolvedSearchSchema
    ? { options: `-c search_path=${resolvedSearchSchema},public` }
    : {}),
});

pool.on("error", (err) => {
  // A background/idle client error should never crash the process.
  console.error("Unexpected PostgreSQL client error", err);
});

export async function withTransaction<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

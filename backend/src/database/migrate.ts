import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "../config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Ordered migration stages.
 *
 * The order is load-bearing, not cosmetic. Postgres cannot *use* a value added
 * by `ALTER TYPE ... ADD VALUE` until the transaction that added it commits, so
 * enum additions must be committed before any DDL that references the new
 * values as a column DEFAULT. Each entry below is therefore its own
 * transaction (its own pool.query call).
 *
 *  1. schema.sql      - original core schema (districts, projects, cases, ...)
 *  2. schema_enums.sql - enum values only, no table references them
 *  3. schema_ext.sql   - new tables + additive columns, may use the new values
 */
const STAGES = ["schema.sql", "schema_enums.sql", "schema_ext.sql"];

/**
 * Applies the ordered migration stages.
 *
 * Exported so `prepareTest.ts` can build a fresh database deterministically.
 * The pool is left open for the caller to close; the CLI entry point below does
 * that itself.
 */
export async function migrate(): Promise<void> {
  for (const stage of STAGES) {
    const sql = readFileSync(path.join(__dirname, stage), "utf-8");
    console.log(`Applying ${stage} ...`);
    await pool.query(sql);
  }
  console.log("Schema applied successfully.");
}

/** True when this module is the process entry point, not an import. */
const isEntryPoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isEntryPoint) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
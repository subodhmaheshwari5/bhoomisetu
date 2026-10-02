/**
 * Deterministic test-environment preparation.
 *
 * Runs before every `npm test` so a fresh clone can go from an empty server to a
 * green suite with no manual steps:
 *
 *   npm test -> pretest -> prepare:test -> isolate -> migrate -> seed
 *
 * The seed truncates and rewrites every domain table, so this script refuses to
 * run unless it can guarantee isolation from the development data. Two
 * mechanisms are supported, in order of preference:
 *
 *   1. A dedicated test DATABASE, when TEST_DATABASE_URL names one. Chosen
 *      automatically if it is configured and the database exists.
 *   2. A dedicated SCHEMA on the configured server (the default). The
 *      application's role is deliberately not a superuser and normally cannot
 *      create databases, but it can always create a schema — and a schema is
 *      enough, because the seed only ever reaches tables it created itself.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "pg";
import { env, isTest, useDedicatedTestDatabase, resolvedDatabaseUrl, resolvedSearchSchema } from "../config/env.js";

/**
 * Parses just enough of a PostgreSQL URL to identify the target database.
 * Returns null for connection strings we cannot reason about, which is treated
 * as unsafe.
 */
export function databaseNameOf(connectionString: string): string | null {
  try {
    const url = new URL(connectionString);
    const name = url.pathname.replace(/^\//, "");
    return name.length > 0 ? decodeURIComponent(name) : null;
  } catch {
    return null;
  }
}

/**
 * Refuses any isolation target that is not recognisably a test target. This is
 * the guard that stops a misconfiguration from truncating real data.
 */
export function assertSafeTarget(name: string, kind: "database" | "schema"): string {
  if (!name) {
    throw new Error(
      `Could not determine the ${kind} name from the test configuration. Refusing to continue because the seed truncates every domain table.`,
    );
  }
  if (!/test/i.test(name)) {
    throw new Error(
      `Refusing to prepare tests against ${kind} "${name}": the name does not contain "test". ` +
        `The seed truncates and rewrites every domain table, so it must only ever run against a dedicated test target.`,
    );
  }
  return name;
}

/** Same server and credentials, but pointed at the `postgres` maintenance DB. */
function maintenanceUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.pathname = "/postgres";
  return url.toString();
}

async function databaseExists(connectionString: string, name: string): Promise<boolean> {
  const probe = new Client({ connectionString: maintenanceUrl(connectionString) });
  try {
    await probe.connect();
    const { rows } = await probe.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    return rows.length > 0;
  } finally {
    await probe.end();
  }
}

async function createDatabase(connectionString: string, name: string): Promise<void> {
  const admin = new Client({ connectionString: maintenanceUrl(connectionString) });
  try {
    await admin.connect();
    // CREATE DATABASE has no IF NOT EXISTS form. The identifier is quoted so an
    // unusual name cannot inject SQL, and the name has already been constrained
    // to contain "test".
    await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    console.log(`Created test database "${name}".`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/permission denied to create database/i.test(message)) {
      throw new Error(
        `TEST_DATABASE_URL names "${name}", which does not exist and cannot be created by this role.\n` +
          `  Either create it once as a superuser:\n\n` +
          `    psql -U postgres -d postgres -c "CREATE DATABASE ${name} OWNER bhoomisetu;"\n\n` +
          `  or unset TEST_DATABASE_URL to use dedicated-schema isolation, which needs no superuser rights.`,
      );
    }
    throw err;
  } finally {
    await admin.end();
  }
}

async function ensureSchema(connectionString: string, schema: string): Promise<void> {
  const admin = new Client({ connectionString });
  try {
    await admin.connect();
    await admin.query(`CREATE SCHEMA IF NOT EXISTS "${schema.replace(/"/g, '""')}"`);
    console.log(`Test schema "${schema}" is ready.`);
  } finally {
    await admin.end();
  }
}

export async function prepareTest(): Promise<void> {
  if (!isTest) {
    throw new Error(
      "prepare:test must run with NODE_ENV=test. It is wired to `npm test` via pretest and the test npm script.",
    );
  }

  // 1. A dedicated database, if one is configured.
  if (useDedicatedTestDatabase) {
    const databaseName = assertSafeTarget(databaseNameOf(env.testDatabaseUrl!) ?? "", "database");
    console.log(`Preparing test database "${databaseName}" ...`);
    if (!(await databaseExists(env.testDatabaseUrl!, databaseName))) {
      await createDatabase(env.testDatabaseUrl!, databaseName);
    }
  } else {
    // 2. Dedicated schema on the configured server.
    const schema = assertSafeTarget(resolvedSearchSchema ?? "", "schema");
    const databaseName = databaseNameOf(resolvedDatabaseUrl) ?? "(configured server)";
    console.log(`Preparing test schema "${schema}" on "${databaseName}" ...`);
    await ensureSchema(resolvedDatabaseUrl, schema);
  }

  // Imported after the isolation is established.
  const { migrate } = await import("./migrate.js");
  const { seed } = await import("./seed.js");
  const { pool } = await import("../config/db.js");

  try {
    await migrate();
    await seed();
    console.log("Test database is ready.");
  } finally {
    await pool.end();
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isEntryPoint) {
  prepareTest().catch((err) => {
    console.error("Test preparation failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
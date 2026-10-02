import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  /**
   * Dedicated database for the automated test run.
   *
   * Optional. When it is set AND the database exists, the test suite uses it.
   * The default is schema isolation on the existing server (see
   * `testDatabaseSchema`) because the application's role is deliberately not a
   * superuser and cannot create databases.
   */
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  /**
   * Schema used to isolate the test run when no dedicated test DATABASE is
   * configured.
   *
   * The test seed truncates and rewrites every domain table. Running it inside a
   * dedicated schema means it can only ever touch tables it created itself, so
   * the development schema on the same server is never at risk.
   */
  testDatabaseSchema: process.env.TEST_DB_SCHEMA ?? "bhoomisetu_test",
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  // AI Configuration
  aiProvider: process.env.AI_PROVIDER ?? "local",
  aiModel: process.env.AI_MODEL ?? "gpt-4o-mini",
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiMaxTokens: Number(process.env.AI_MAX_TOKENS ?? 2000),
  aiTemperature: Number(process.env.AI_TEMPERATURE ?? 0.3),
};

export const isProduction = env.nodeEnv === "production";
export const isTest = env.nodeEnv === "test";

/**
 * Decides whether the test run should use a dedicated DATABASE rather than a
 * dedicated SCHEMA.
 *
 * Extracted as a pure function so the routing can be tested without a live
 * server. Two independent refusals matter here:
 *
 *   - outside NODE_ENV=test the answer is always false, so a stray
 *     TEST_DATABASE_URL can never redirect the dev or production server;
 *   - a database whose name does not contain "test" is refused, so pointing
 *     TEST_DATABASE_URL at the development database degrades to schema
 *     isolation instead of handing the truncating seed the real one.
 */
export function shouldUseDedicatedTestDatabase(nodeEnv: string, testDatabaseUrl?: string): boolean {
  if (nodeEnv !== "test" || !testDatabaseUrl) return false;
  const name = testDatabaseUrl.split("/").pop() ?? "";
  return /test/i.test(decodeURIComponent(name.split("?")[0]));
}

export const useDedicatedTestDatabase = shouldUseDedicatedTestDatabase(
  env.nodeEnv,
  env.testDatabaseUrl,
);

/**
 * How the process should actually connect.
 *
 * In the test environment there are two safe options and no unsafe one:
 *   - a dedicated test DATABASE, when TEST_DATABASE_URL names one, or
 *   - a dedicated SCHEMA on the configured server, which the current role can
 *     create without superuser rights.
 *
 * Either way the test seed can only reach tables belonging to the test run.
 */
export const resolvedDatabaseUrl = isTest && useDedicatedTestDatabase
  ? env.testDatabaseUrl!
  : env.databaseUrl;

/**
 * Schema pinned ahead of `public` on every test connection, or null outside the
 * test environment. Unqualified table names resolve here first, so the seed
 * truncates only its own tables; `public` stays on the path so PostGIS types and
 * functions remain visible.
 */
export const resolvedSearchSchema = isTest && !useDedicatedTestDatabase
  ? env.testDatabaseSchema
  : null;

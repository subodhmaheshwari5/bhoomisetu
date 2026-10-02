import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  databaseNameOf,
  assertSafeTarget,
} from "../src/database/prepareTest.js";
import {
  resolvedSearchSchema,
  resolvedDatabaseUrl,
  useDedicatedTestDatabase,
  shouldUseDedicatedTestDatabase,
} from "../src/config/env.js";

/**
 * Safety guards for the test bootstrap.
 *
 * `prepare:test` truncates and rewrites every domain table. `assertSafeTarget` is
 * the only thing standing between a misconfiguration and the loss of real data,
 * so it is tested directly rather than being left to inspection.
 */

describe("Test bootstrap safety guards", () => {
  test("databaseNameOf extracts the database name", () => {
    assert.equal(
      databaseNameOf("postgresql://user:pw@localhost:5432/bhoomisetu_test"),
      "bhoomisetu_test",
    );
    assert.equal(
      databaseNameOf("postgres://user@host:5432/my_test_db"),
      "my_test_db",
    );
    // Percent-encoded names are decoded, so the guard inspects the real name.
    assert.equal(
      databaseNameOf("postgresql://user@h:5432/bhoomisetu%5Ftest"),
      "bhoomisetu_test",
    );
  });

  test("databaseNameOf returns null for an unparseable connection string", () => {
    // Returning null must not be mistaken for "safe": callers treat it as unsafe.
    assert.equal(databaseNameOf("not-a-url"), null);
    assert.equal(databaseNameOf(""), null);
  });

  test("assertSafeTarget accepts names containing 'test', in any case", () => {
    for (const name of [
      "bhoomisetu_test",
      "test",
      "BHOOMISETU_TEST",
      "Test",
      "bhoomisetu_test_2",
      "my_test_db",
    ]) {
      assert.equal(assertSafeTarget(name, "database"), name, `${name} should be accepted`);
    }
  });

  test("assertSafeTarget refuses a database that is not a test database", () => {
    for (const name of ["bhoomisetu", "postgres", "production", "bhoomisetu_prod"]) {
      assert.throws(
        () => assertSafeTarget(name, "database"),
        /does not contain "test"/,
        `${name} must be refused`,
      );
    }
  });

  test("assertSafeTarget refuses an empty or missing target", () => {
    assert.throws(() => assertSafeTarget("", "schema"), /Could not determine the schema name/);
    assert.throws(() => assertSafeTarget("", "database"), /Could not determine the database name/);
  });

  test("assertSafeTarget works for schemas as well as databases", () => {
    assert.equal(assertSafeTarget("bhoomisetu_test", "schema"), "bhoomisetu_test");
    assert.throws(() => assertSafeTarget("public", "schema"), /does not contain "test"/);
  });

  test("the refusal explains why it is refusing", () => {
    // An operator hitting this must be told what went wrong and what to do.
    try {
      assertSafeTarget("bhoomisetu", "database");
      assert.fail("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      assert.match(message, /truncates and rewrites every domain table/);
      assert.match(message, /must only ever run against a dedicated test target/);
    }
  });
});

describe("Test isolation resolution", () => {
  test("the suite runs isolated: the active target is recognisably a test target", () => {
    // This is the invariant that makes the whole flow safe, so it is asserted
    // against the live resolved values rather than a hard-coded expectation.
    const target = useDedicatedTestDatabase
      ? databaseNameOf(resolvedDatabaseUrl) ?? ""
      : resolvedSearchSchema ?? "";
    assert.ok(target, "the test run must resolve to an isolation target");
    assert.match(target, /test/i, `isolation target "${target}" must contain "test"`);
  });

  test("no dedicated test database configured, so schema isolation is used", () => {
    // TEST_DATABASE_URL is not set in .env.test, because that database requires a
    // superuser to create. When it is unset the suite must fall back to the
    // dedicated schema rather than using the development schema.
    assert.equal(useDedicatedTestDatabase, false);
    assert.equal(resolvedSearchSchema, "bhoomisetu_test");
  });

  test("the development schema is never the pinned search path", () => {
    // `public` is retained on the path so PostGIS stays resolvable, but it must
    // not be first: the seed has to reach its own tables only.
    assert.notEqual(resolvedSearchSchema, "public");
    assert.notEqual(resolvedSearchSchema, null);
  });
});

describe("Test database routing", () => {
  // Pure decision logic, so the branch that needs a superuser to create a
  // database is still covered without one.

  test("a test-named database is used in the test environment", () => {
    assert.equal(
      shouldUseDedicatedTestDatabase("test", "postgresql://u:p@h:5432/bhoomisetu_test"),
      true,
    );
    assert.equal(shouldUseDedicatedTestDatabase("test", "postgresql://u:p@h:5432/TEST"), true);
    assert.equal(
      shouldUseDedicatedTestDatabase("test", "postgresql://u:p@h:5432/bhoomisetu_test?sslmode=require"),
      true,
      "query parameters must not defeat the name check",
    );
  });

  test("a database that is not test-named is refused", () => {
    for (const url of [
      "postgresql://u:p@h:5432/bhoomisetu",
      "postgresql://u:p@h:5432/postgres",
      "postgresql://u:p@h:5432/production",
    ]) {
      assert.equal(
        shouldUseDedicatedTestDatabase("test", url),
        false,
        `${url} must not be used for the test run`,
      );
    }
  });

  test("a stray TEST_DATABASE_URL never redirects a non-test process", () => {
    // This is the guard that stops a configured test URL from affecting the dev
    // or production server, whatever the name says.
    for (const nodeEnv of ["development", "production", ""]) {
      assert.equal(
        shouldUseDedicatedTestDatabase(nodeEnv, "postgresql://u:p@h:5432/bhoomisetu_test"),
        false,
        `NODE_ENV=${nodeEnv} must not use a test database`,
      );
    }
  });

  test("an unset TEST_DATABASE_URL falls back to schema isolation", () => {
    assert.equal(shouldUseDedicatedTestDatabase("test", undefined), false);
    assert.equal(shouldUseDedicatedTestDatabase("test", ""), false);
  });
});
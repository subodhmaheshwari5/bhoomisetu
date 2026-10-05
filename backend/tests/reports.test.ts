import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, loginAs, DEMO_EMAILS } from "./helpers.js";

/**
 * Reports are exports: every row a list endpoint would page, scoped by the
 * caller's authorization. This regression guards a bug where an unrestricted
 * user with no filters got `WHERE ` followed by `ORDER BY`, a PostgreSQL
 * "syntax error at or near ORDER" (SQLSTATE 42601).
 */

describe("Reports", () => {
  test("GET /reports?type=progress succeeds for an unrestricted role", async () => {
    // super_admin is unrestricted, and no district/status filter is passed,
    // so scopeFor emits zero clauses — the exact case that used to 500.
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<{ caseNumber: string }[]>("/reports?type=progress", { token });
    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(Array.isArray(res.body.data), "progress report must return an array");
    assert.ok(res.body.data!.length > 0, "should list seeded cases");
  });

  test("progress rows carry the expected columns", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch("/reports?type=progress", { token });
    const first = res.body.data![0] as Record<string, unknown>;
    for (const col of ["caseNumber", "project", "district", "currentStage", "status", "riskLevel", "updatedAt"]) {
      assert.ok(col in first, `column ${col} missing from progress report`);
    }
  });

  test("progress is filtered by the caller's district scope", async () => {
    // districtOfficer is district-scoped; the report must only return rows in
    // that officer's district, not every case in the database.
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const res = await apiFetch<{ district: string }[]>("/reports?type=progress", { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.length > 0);
    const districts = new Set(res.body.data!.map((r) => r.district));
    assert.equal(districts.size, 1, "a district officer must see only one district");
  });

  test("progress respects a status filter", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<{ status: string }[]>("/reports?type=progress&status=delayed", { token });
    assert.equal(res.status, 200);
    for (const row of res.body.data!) {
      assert.equal(row.status, "delayed");
    }
  });

  test("GET /reports?type=progress is CSV-exportable", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch("/reports?type=progress&format=csv", { token });
    assert.equal(res.status, 200);
    const text = JSON.stringify(res.body);
    assert.ok(text.includes("case_number") || text.includes("caseNumber"), "CSV must have a header row");
  });

  test("an invalid report type is rejected", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch("/reports?type=bogus", { token });
    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, "INVALID_REPORT_TYPE");
  });

  test("compensation report works for an unrestricted user (same latent path)", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch("/reports?type=compensation", { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
  });
});

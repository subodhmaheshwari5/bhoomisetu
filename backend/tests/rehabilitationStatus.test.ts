import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, loginAs, DEMO_EMAILS } from "./helpers.js";
import {
  REHABILITATION_STATUSES,
  REHABILITATION_STATUS_LABELS,
} from "../src/services/rehabilitationService.js";
import { rehabilitationQuerySchema } from "../src/validators/schemas.js";
import { pool } from "../src/config/db.js";

/**
 * Regression coverage for the `in_progress` R&R status.
 *
 * IN_PROGRESS -> the R&R process has started but is not yet completed. It is an
 * active/in-flight state, never folded into another status, and distinct from
 * both `completed` and `not_started`.
 *
 * These tests must survive the vocabulary changing again, so they derive their
 * expectations from the exported list rather than hard-coding 12.
 */

const LEGACY_STATUSES = [
  "not_started",
  "eligibility_pending",
  "eligible",
  "entitlement_pending",
  "entitlement_approved",
  "assistance_pending",
  "assistance_provided",
  "resettlement_pending",
  "resettled",
  "completed",
  "disputed",
] as const;

interface RRRow {
  id: string;
  caseId: string;
  caseNumber: string;
  status: string;
}

interface Summary {
  total: number;
  completed: number;
  notStarted: number;
  inProgress: number;
  disputed: number;
  inFlight: number;
  completionRate: number;
  byStatus: { status: string; count: number }[];
}

after(async () => {
  await pool.end();
});

describe("R&R status vocabulary includes in_progress", () => {
  test("the declared set is the 11 legacy statuses plus in_progress", () => {
    assert.ok(
      REHABILITATION_STATUSES.includes("in_progress"),
      "in_progress must be part of the authoritative R&R status list",
    );
    assert.equal(REHABILITATION_STATUSES.length, LEGACY_STATUSES.length + 1);

    for (const status of LEGACY_STATUSES) {
      assert.ok(
        REHABILITATION_STATUSES.includes(status),
        `legacy status "${status}" must survive the addition`,
      );
    }
    assert.equal(new Set(REHABILITATION_STATUSES).size, REHABILITATION_STATUSES.length);
  });

  test("1. validation accepts in_progress", () => {
    const parsed = rehabilitationQuerySchema.safeParse({ status: "in_progress" });
    assert.ok(parsed.success, `in_progress was rejected by validation: ${parsed.error?.issues[0]?.message}`);
    assert.equal(parsed.data.status, "in_progress");
  });

  test("1b. validation still rejects a status that does not exist", () => {
    // Guards the fix for the silent-empty-list behaviour: an unknown status must
    // be reported, not quietly treated as "no matches".
    assert.equal(rehabilitationQuerySchema.safeParse({ status: "in-progress" }).success, false);
    assert.equal(rehabilitationQuerySchema.safeParse({ status: "unknown_status" }).success, false);
  });

  test("1c. the HTTP layer accepts in_progress and rejects an unknown status", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const good = await apiFetch<RRRow[]>("/rehabilitation?status=in_progress", { token });
    assert.equal(good.status, 200);

    const bad = await apiFetch("/rehabilitation?status=in-progress", { token });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error?.code, "INVALID_REHABILITATION_QUERY");
  });

  test("2. in_progress can be stored, and the constraint rejects unknown statuses", async () => {
    // The suite's files share one database and run in parallel, so these writes
    // are isolated in a transaction that is rolled back: an uncommitted insert is
    // invisible to the row-count assertions in the other test files.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ id: string }>("SELECT id FROM acquisition_cases LIMIT 1");
      const caseId = rows[0].id;
      const id = "00000000-0000-4000-8000-00000000a001";

      await client.query(
        "INSERT INTO rehabilitation (id, case_id, status) VALUES ($1, $2, 'in_progress')",
        [id, caseId],
      );
      const stored = await client.query<{ status: string }>(
        "SELECT status FROM rehabilitation WHERE id = $1",
        [id],
      );
      assert.equal(stored.rows[0].status, "in_progress");

      await assert.rejects(
        () =>
          client.query(
            "INSERT INTO rehabilitation (id, case_id, status) VALUES ($1, $2, 'not_a_status')",
            ["00000000-0000-4000-8000-00000000a002", caseId],
          ),
        /rehabilitation_status_check|violates check constraint/i,
        "the CHECK constraint must reject a status outside the declared set",
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  test("2b. every declared status is storable under the constraint", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ id: string }>("SELECT id FROM acquisition_cases LIMIT 1");
      const caseId = rows[0].id;

      for (const [index, status] of REHABILITATION_STATUSES.entries()) {
        const id = `00000000-0000-4000-8000-00000000b0${String(index).padStart(2, "0")}`;
        await client.query("INSERT INTO rehabilitation (id, case_id, status) VALUES ($1, $2, $3)", [
          id,
          caseId,
          status,
        ]);
        const stored = await client.query<{ status: string }>(
          "SELECT status FROM rehabilitation WHERE id = $1",
          [id],
        );
        assert.equal(stored.rows[0].status, status, `status ${status} did not round-trip`);
      }
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  test("3. in_progress appears in API responses", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<{ statuses: { value: string; label: string }[] }>(
      "/rehabilitation/statuses",
      { token },
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.statuses.some((s) => s.value === "in_progress"));

    // The seeded dataset must actually contain in_progress rows, otherwise the
    // filter and analytics tests below would pass vacuously.
    const rows = (await apiFetch<RRRow[]>("/rehabilitation?status=in_progress", { token })).body.data!;
    assert.ok(rows.length > 0, "expected seeded R&R records in the in_progress state");
    assert.ok(rows.every((r) => r.status === "in_progress"));
  });

  test("4. in_progress has a human-readable label", () => {
    assert.equal(REHABILITATION_STATUS_LABELS.in_progress, "In Progress");

    const label = REHABILITATION_STATUS_LABELS.in_progress;
    assert.ok(label.trim().length > 0);
    assert.notEqual(label, "in_progress", "the label must not be the raw value");
    // The frontend renders this string from STATUS_TONE/api; the test asserts the
    // backend contract that feeds it.
    assert.ok(!label.includes("_"), "a human-readable label must not contain underscores");
  });

  test("5. filtering by in_progress works and is exclusive", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const all = (await apiFetch<RRRow[]>("/rehabilitation", { token })).body.data!;
    const expected = all.filter((r) => r.status === "in_progress").length;

    const res = await apiFetch<RRRow[]>("/rehabilitation?status=in_progress", { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.length, expected);
    assert.ok(res.body.data!.every((r) => r.status === "in_progress"));
    assert.ok(res.body.data!.length < all.length, "the filter must actually narrow the list");
  });

  test("6. analytics count in_progress as active, not completed and not pending", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const rows = (await apiFetch<RRRow[]>("/rehabilitation", { token })).body.data!;
    const res = await apiFetch<Summary>("/rehabilitation/summary", { token });
    assert.equal(res.status, 200);
    const s = res.body.data!;

    const expected = rows.filter((r) => r.status === "in_progress").length;
    assert.equal(s.inProgress, expected, "in_progress was not counted");

    // byStatus must carry the count too, so tile and table agree.
    const fromByStatus = s.byStatus.find((r) => r.status === "in_progress")?.count ?? 0;
    assert.equal(fromByStatus, expected);

    // The three buckets are mutually exclusive and exhaustive over the total.
    assert.equal(s.completed + s.inFlight + s.notStarted, s.total);
    assert.equal(s.notStarted, rows.filter((r) => r.status === "not_started").length);
    assert.equal(s.completed, rows.filter((r) => r.status === "completed").length);

    // in_progress is active: inside inFlight, outside both other buckets.
    assert.ok(
      s.inFlight >= s.inProgress,
      "in_progress records must be included in the in-flight count",
    );
    assert.notEqual(s.inFlight, s.completed, "in_progress must not be treated as completed");

    const completionFromCount = s.total === 0 ? 0 : Math.round((s.completed / s.total) * 100);
    assert.equal(s.completionRate, completionFromCount);
  });

  test("7. the existing 11 statuses still work end to end", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);

    const statuses = await apiFetch<{ statuses: { value: string; label: string }[] }>(
      "/rehabilitation/statuses",
      { token },
    );
    assert.equal(statuses.status, 200);
    const values = statuses.body.data!.statuses.map((s) => s.value);
    for (const status of LEGACY_STATUSES) {
      assert.ok(values.includes(status), `legacy status "${status}" disappeared from the API`);
      assert.ok(REHABILITATION_STATUS_LABELS[status], `legacy status "${status}" lost its label`);
    }

    // Each legacy status must still be accepted as a filter.
    for (const status of LEGACY_STATUSES) {
      const res = await apiFetch<RRRow[]>(`/rehabilitation?status=${status}`, { token });
      assert.equal(res.status, 200, `filtering by legacy status "${status}" failed`);
      assert.ok(
        res.body.data!.every((r) => r.status === status),
        `filter by "${status}" returned other statuses`,
      );
    }
  });
});
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, loginAs, DEMO_EMAILS } from "./helpers.js";
import { pool } from "../src/config/db.js";

/**
 * Administration endpoints.
 *
 * Two things are being protected here rather than merely exercised:
 *   - password material must never leave the server, and
 *   - secret settings must never be readable or writable through the API.
 *
 * The suite runs one file at a time, so rows committed by this file are cleaned
 * up before the next file starts.
 */

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  districtId: string | null;
  districtName: string | null;
}

interface Setting {
  key: string;
  value: unknown;
  category: string;
  isSecret: boolean;
}

interface AuditPage {
  total: number;
  limit: number;
  offset: number;
  entries: { id: string; action: string; entity: string; entityId: string }[];
}

const SETTINGS = [
  {
    key: "test.risk.threshold",
    value: 42,
    category: "Risk",
    description: "Test threshold.",
    is_secret: false,
  },
  {
    key: "test.flag.enabled",
    value: true,
    category: "Workflow",
    description: "Test toggle.",
    is_secret: false,
  },
  {
    key: "test.integration.api_key",
    value: "super-secret-value",
    category: "Integrations",
    description: "A secret that must never be readable.",
    is_secret: true,
  },
];

const ADMIN_ROLES: [string, string][] = [
  ["super admin", DEMO_EMAILS.superAdmin],
  ["dolr officer", DEMO_EMAILS.dolrOfficer],
];

const NON_ADMIN_ROLES: [string, string][] = [
  ["state officer", DEMO_EMAILS.stateOfficer],
  ["district officer", DEMO_EMAILS.districtOfficer],
  ["landowner", DEMO_EMAILS.landowner],
  ["land agency", DEMO_EMAILS.landAgency],
];

const ENDPOINTS = [
  "/admin/users",
  "/admin/states",
  "/admin/districts",
  "/admin/settings",
  "/admin/audit-logs",
  "/admin/audit-logs/facets",
];

before(async () => {
  for (const s of SETTINGS) {
    await pool.query(
      `INSERT INTO system_settings (key, value, category, description, is_secret)
       VALUES ($1, $2::jsonb, $3, $4, $5)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_secret = EXCLUDED.is_secret`,
      [s.key, JSON.stringify(s.value), s.category, s.description, s.is_secret],
    );
  }
});

after(async () => {
  await pool.query("DELETE FROM system_settings WHERE key LIKE 'test.%'");
  await pool.end();
});

describe("Admin authorization", () => {
  for (const [label, email] of ADMIN_ROLES) {
    test(`${label} can read every admin endpoint`, async () => {
      const token = await loginAs(email);
      for (const path of ENDPOINTS) {
        const res = await apiFetch(path, { token });
        assert.equal(res.status, 200, `${label} should reach ${path}`);
      }
    });
  }

  for (const [label, email] of NON_ADMIN_ROLES) {
    test(`${label} is refused every admin endpoint`, async () => {
      const token = await loginAs(email);
      for (const path of ENDPOINTS) {
        const res = await apiFetch(path, { token });
        assert.equal(res.status, 403, `${label} must not reach ${path}`);
      }
    });
  }

  test("admin endpoints reject an unauthenticated caller", async () => {
    for (const path of ENDPOINTS) {
      const res = await apiFetch(path);
      assert.equal(res.status, 401, `${path} must require authentication`);
    }
  });

  test("a non-admin cannot write a setting", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const res = await apiFetch("/admin/settings/test.risk.threshold", {
      token,
      method: "PATCH",
      body: { value: 1 },
    });
    assert.equal(res.status, 403);
  });
});

describe("Admin users", () => {
  test("never returns password material", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<AdminUser[]>("/admin/users", { token });
    assert.equal(res.status, 200);

    const raw = JSON.stringify(res.body.data);
    assert.ok(!/password_hash|passwordHash/.test(raw), "the payload must not contain a password hash");
    assert.ok(!/\$2[aby]\$/.test(raw), "no bcrypt hash may appear anywhere in the payload");
  });

  test("returns the seeded accounts with roles and district scope", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<AdminUser[]>("/admin/users", { token });
    const users = res.body.data!;
    assert.ok(users.length > 0);

    const admin = users.find((u) => u.role === "super_admin");
    assert.ok(admin, "expected a super_admin account");
    // A global role is not district-scoped, so its district must be null rather
    // than an arbitrary district that would look like a real restriction.
    assert.equal(admin!.districtId, null);

    const districtOfficer = users.find((u) => u.role === "district_officer");
    assert.ok(districtOfficer, "expected a district_officer account");
    assert.ok(districtOfficer!.districtId, "a district officer must carry a district");
    assert.ok(districtOfficer!.districtName, "the district must be resolved for display");
  });
});

describe("Admin states and districts", () => {
  test("states report their district counts", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<{ name: string; districtCount: number }[]>("/admin/states", { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.length > 0);
    for (const state of res.body.data!) {
      assert.ok(Number.isInteger(state.districtCount), `district count for ${state.name} is not a number`);
      assert.ok(state.districtCount >= 0);
    }
  });

  test("district counts agree with the district list", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const states = (await apiFetch<{ districtCount: number }[]>("/admin/states", { token })).body.data!;
    const districts = (
      await apiFetch<{ id: string; caseCount: number; projectCount: number }[]>("/admin/districts", { token })
    ).body.data!;

    const summed = states.reduce((sum, s) => sum + s.districtCount, 0);
    // Every district belongs to exactly one state, so the two must reconcile.
    assert.equal(summed, districts.length, "state district counts do not match the district list");
  });

  test("district case counts match the cases actually stored", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const districts = (
      await apiFetch<{ id: string; caseCount: number }[]>("/admin/districts", { token })
    ).body.data!;

    for (const district of districts) {
      // Counted in the database rather than summed from another endpoint, so a
      // scoping bug in either direction shows up instead of cancelling out.
      const { rows } = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM acquisition_cases WHERE district_id = $1",
        [district.id],
      );
      assert.equal(
        Number(rows[0].count),
        district.caseCount,
        `case count mismatch for ${district.name}`,
      );
    }
  });
});

describe("Admin settings", () => {
  test("masks the value of a secret setting", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiGetSettings(token);
    const secret = res.find((s) => s.isSecret);
    assert.ok(secret, "expected a secret setting in the fixture");

    const raw = JSON.stringify(res);
    assert.ok(
      !raw.includes("super-secret-value"),
      "a secret value must never appear in the settings payload",
    );
    assert.ok(
      !String(secret!.value).includes("super-secret-value"),
      "the secret's own value must be masked",
    );
  });

  test("a non-secret setting returns its real value", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const settings = await apiGetSettings(token);
    const threshold = settings.find((s) => s.key === "test.risk.threshold");
    assert.ok(threshold);
    assert.equal(threshold!.value, 42);
  });

  test("a non-secret setting can be updated, and the write is audited", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);

    const before = (await apiFetch<{ total: number }>("/admin/audit-logs?limit=1", { token })).body.data!.total;

    const res = await apiFetch<Setting>("/admin/settings/test.risk.threshold", {
      token,
      method: "PATCH",
      body: { value: 77 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.value, 77);

    const after = (await apiFetch<{ total: number }>("/admin/audit-logs?limit=1", { token })).body.data!.total;
    assert.ok(after > before, "a settings change must leave an audit trail");

    const logs = (
      await apiFetch<AuditPage>("/admin/audit-logs?action=UPDATE_SETTING&limit=5", { token })
    ).body.data!;
    assert.ok(logs.entries.length > 0);
    assert.equal(logs.entries[0].entity, "system_settings");
    assert.equal(logs.entries[0].entityId, "test.risk.threshold");
  });

  test("a number setting stays a number, not a string", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<Setting>("/admin/settings/test.risk.threshold", {
      token,
      method: "PATCH",
      body: { value: 5 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.value, 5);
    assert.equal(typeof res.body.data!.value, "number");
  });

  test("a boolean setting stays a boolean", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    await apiFetch("/admin/settings/test.flag.enabled", {
      token,
      method: "PATCH",
      body: { value: false },
    });
    const settings = await apiGetSettings(token);
    const flag = settings.find((s) => s.key === "test.flag.enabled");
    assert.equal(flag!.value, false);
  });

  test("a secret setting cannot be written through the API", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch("/admin/settings/test.integration.api_key", {
      token,
      method: "PATCH",
      body: { value: "tampered" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, "SECRET_SETTING_READONLY");

    // The stored value must be untouched.
    const { rows } = await pool.query("SELECT value FROM system_settings WHERE key = $1", [
      "test.integration.api_key",
    ]);
    assert.equal(rows[0].value, "super-secret-value");

    // A rejected write must not leave the attempted value lying in the audit log.
    const logs = (
      await apiFetch<unknown>("/admin/audit-logs?action=UPDATE_SETTING&limit=50", { token })
    ).body.data!;
    assert.ok(
      !JSON.stringify(logs).includes("tampered"),
      "a rejected secret write must not appear in the audit trail",
    );
  });

  test("the audit trail records what a non-secret setting actually changed from and to", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);

    // Start from a known value so the "previous" side is not whatever the last
    // test happened to leave behind.
    await apiFetch("/admin/settings/test.risk.threshold", {
      token,
      method: "PATCH",
      body: { value: 10 },
    });
    await apiFetch("/admin/settings/test.risk.threshold", {
      token,
      method: "PATCH",
      body: { value: 20 },
    });

    const logs = (
      await apiFetch<{ entries: { newValue: { value?: unknown }; previousValue: { value?: unknown } }[] }>(
        "/admin/audit-logs?action=UPDATE_SETTING&limit=1",
        { token },
      )
    ).body.data!;

    const latest = logs.entries[0];
    // An audit log whose values are all "[redacted]" cannot answer the only
    // question anyone reads it for: what did this setting actually become?
    assert.equal(latest.newValue?.value, 20, "the audit trail must record the new value");
    assert.equal(latest.previousValue?.value, 10, "the audit trail must record the previous value");

    const raw = JSON.stringify(logs);
    assert.ok(
      !raw.includes("[redacted]"),
      "an ordinary setting's values must not be redacted in the audit trail",
    );
  });

  test("an unknown setting returns 404 rather than creating one", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch("/admin/settings/no.such.setting", {
      token,
      method: "PATCH",
      body: { value: 1 },
    });
    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, "SETTING_NOT_FOUND");

    const { rows } = await pool.query("SELECT 1 FROM system_settings WHERE key = $1", [
      "no.such.setting",
    ]);
    assert.equal(rows.length, 0, "a rejected write must not insert a row");
  });
});

describe("Admin audit log", () => {
  test("paginates without losing or duplicating entries", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const all = (await apiFetch<AuditPage>("/admin/audit-logs?limit=200", { token })).body.data!;
    assert.ok(all.total > 0);

    const first = (await apiFetch<AuditPage>("/admin/audit-logs?limit=2&offset=0", { token })).body.data!;
    const second = (await apiFetch<AuditPage>("/admin/audit-logs?limit=2&offset=2", { token })).body.data!;

    assert.equal(first.entries.length, Math.min(2, all.total));
    assert.equal(first.total, all.total, "total must describe the whole result, not the page");

    const firstIds = new Set(first.entries.map((e) => e.id));
    for (const entry of second.entries) {
      assert.ok(!firstIds.has(entry.id), "page 2 repeated an entry from page 1");
    }

    const walked = [...first.entries, ...second.entries];
    const walkedIds = new Set(walked.map((e) => e.id));
    assert.equal(walkedIds.size, walked.length, "entries must be unique across pages");
  });

  test("orders newest first", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const page = (await apiFetch<{ entries: { createdAt: string }[] }>(
      "/admin/audit-logs?limit=25",
      { token },
    )).body.data!;
    const times = page.entries.map((e) => new Date(e.createdAt).getTime());
    for (let i = 1; i < times.length; i += 1) {
      assert.ok(times[i - 1] >= times[i], "entries are not in descending order");
    }
  });

  test("filters by entity and by action", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);

    const byEntity = (
      await apiFetch<AuditPage>("/admin/audit-logs?entity=system_settings&limit=50", { token })
    ).body.data!;
    assert.ok(byEntity.total > 0);
    assert.ok(byEntity.entries.every((e) => e.entity === "system_settings"));

    const byAction = (
      await apiFetch<AuditPage>("/admin/audit-logs?action=CREATE_CASE&limit=50", { token })
    ).body.data!;
    assert.ok(byAction.entries.every((e) => e.action === "CREATE_CASE"));

    const none = (await apiFetch<AuditPage>("/admin/audit-logs?entity=nothing_here", { token })).body.data!;
    assert.equal(none.total, 0);
    assert.equal(none.entries.length, 0);
  });

  test("facets describe the entities and actions present", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<{ kind: string; value: string; count: number }[]>(
      "/admin/audit-logs/facets",
      { token },
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.some((f) => f.kind === "entity"));
    assert.ok(res.body.data!.some((f) => f.kind === "action"));
    assert.ok(res.body.data!.some((f) => f.value === "system_settings"));
  });

  test("an oversized page size is rejected rather than silently clamped", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch("/admin/audit-logs?limit=100000", { token });
    assert.equal(res.status, 400);
  });

  test("a negative offset is rejected", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch("/admin/audit-logs?offset=-1", { token });
    assert.equal(res.status, 400);
  });
});

async function apiGetSettings(token: string): Promise<Setting[]> {
  const res = await apiFetch<Setting[]>("/admin/settings", { token });
  assert.equal(res.status, 200);
  return res.body.data!;
}
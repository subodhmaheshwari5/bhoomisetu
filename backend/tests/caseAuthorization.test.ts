import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, loginAs, DEMO_EMAILS } from "./helpers.js";

/**
 * SECURITY REGRESSION SUITE — case authorization.
 *
 * This file exists to prove that case-derived reads are authorization-scoped,
 * and to FAIL LOUDLY if that scoping is ever removed or weakened. Every test
 * here is written so that restoring the old behaviour (no scope on GET /cases or
 * GET /cases/:id) turns it red.
 *
 * The specific historical defect being guarded:
 *   GET /api/cases      returned every case in the system to any authenticated role
 *   GET /api/cases/:id  returned any case by id, with no scope check
 *   GET /api/cases/:id/stages, /documents, /risk-score  reachable by direct id
 *   GET /api/compensation  returned every case's payment amounts to any role
 */

interface CaseRow {
  id: string;
  caseNumber: string;
  projectId: string;
  districtId: string;
  districtName: string;
  status: string;
}

/** Every role's case list, keyed by role, using the unrestricted admin as the reference. */
async function allCases(token: string): Promise<CaseRow[]> {
  const res = await apiFetch<CaseRow[]>("/cases", { token });
  assert.equal(res.status, 200);
  return res.body.data ?? [];
}

async function districtOf(token: string): Promise<string> {
  const me = await apiFetch<{ districtId?: string }>("/auth/me", { token });
  assert.equal(me.status, 200);
  const districtId = me.body.data?.districtId;
  assert.ok(districtId, "expected the token to carry a districtId");
  return districtId;
}

/** A case the caller is definitely NOT entitled to, derived from the admin view. */
async function foreignCaseFor(token: string, adminToken: string): Promise<CaseRow> {
  const mine = new Set((await allCases(token)).map((c) => c.id));
  const foreign = (await allCases(adminToken)).find((c) => !mine.has(c.id));
  assert.ok(foreign, "expected at least one case outside the caller's scope");
  return foreign;
}

// ===========================================================================
// STEP 17 — the core regression guard
// ===========================================================================
describe("SECURITY: case list and detail are authorization-scoped", () => {
  test("GET /cases returns different results per role (unscoped would be identical)", async () => {
    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const district = await loginAs(DEMO_EMAILS.districtOfficer);
    const owner = await loginAs(DEMO_EMAILS.landowner);

    const adminCases = await allCases(admin);
    const districtCases = await allCases(district);
    const ownerCases = await allCases(owner);

    assert.ok(adminCases.length > 0, "admin should see cases");

    // The landowner must be a strict subset. Under the old behaviour all three
    // lists were byte-identical, which is exactly the vulnerability.
    assert.ok(
      ownerCases.length < adminCases.length,
      `landowner saw ${ownerCases.length} of ${adminCases.length} cases — scoping appears to be missing`,
    );
    assert.ok(
      districtCases.length < adminCases.length,
      `district officer saw ${districtCases.length} of ${adminCases.length} cases — scoping appears to be missing`,
    );
  });

  test("landowner's case list contains only cases on parcels they own", async () => {
    const owner = await loginAs(DEMO_EMAILS.landowner);
    const ownerCases = await allCases(owner);

    const ownedParcels = await apiFetch<{ id: string }[]>("/landowner/me/parcels", { token: owner });
    const parcelIds = new Set((ownedParcels.body.data ?? []).map((p) => p.id));
    assert.ok(parcelIds.size > 0, "demo landowner should own at least one parcel");

    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const adminCases = await allCases(admin);
    const byId = new Map(adminCases.map((c) => [c.id, c]));

    for (const c of ownerCases) {
      const full = byId.get(c.id);
      assert.ok(full, "landowner list must be a subset of the real case set");
      assert.ok(
        parcelIds.has(full.parcelId ?? (full as unknown as { parcelId: string }).parcelId),
        `landowner was shown a case on a parcel they do not own: ${c.caseNumber}`,
      );
    }
  });

  test("landowner's case list is identical to their self-scoped endpoint", async () => {
    const owner = await loginAs(DEMO_EMAILS.landowner);
    const viaCases = await allCases(owner);
    const viaMe = await apiFetch<CaseRow[]>("/landowner/me/cases", { token: owner });

    const a = new Set(viaCases.map((c) => c.id));
    const b = new Set((viaMe.body.data ?? []).map((c) => c.id));
    assert.deepEqual([...a].sort(), [...b].sort());
  });
});

// ===========================================================================
// STEP 12 — role matrix
// ===========================================================================
describe("SECURITY: role matrix", () => {
  test("SUPER_ADMIN list and detail are authorized", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const cases = await allCases(token);
    assert.ok(cases.length > 0);

    const detail = await apiFetch<CaseRow>(`/cases/${cases[0].id}`, { token });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data!.id, cases[0].id);
  });

  test("STATE_OFFICER is unrestricted across districts", async () => {
    const token = await loginAs(DEMO_EMAILS.stateOfficer);
    const cases = await allCases(token);
    const districts = new Set(cases.map((c) => c.districtName));
    assert.ok(districts.size > 1, "state officer should see more than one district");
  });

  test("DISTRICT_OFFICER sees only their assigned district", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const expected = await districtOf(token);
    const cases = await allCases(token);

    assert.ok(cases.length > 0, "district officer should see their own cases");
    for (const c of cases) {
      assert.equal(c.districtId, expected, `case ${c.caseNumber} is outside the officer's district`);
    }
  });

  test("DISTRICT_OFFICER cannot read a case in another district (IDOR)", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const own = await districtOf(token);
    const foreign = (await allCases(admin)).find((c) => c.districtId !== own);
    assert.ok(foreign, "expected a case in another district");

    const res = await apiFetch(`/cases/${foreign.id}`, { token });
    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, "FORBIDDEN");
    // The refusal must not carry the case's data.
    assert.ok(!JSON.stringify(res.body).includes(foreign.caseNumber));
  });

  test("DISTRICT_OFFICER fails closed when the token carries no district", async () => {
    // A district-scoped role with no district must be refused, not granted
    // unrestricted access. Proven at the model level because forging a token is
    // out of scope: districtId is only absent for roles that are not
    // district-scoped.
    const { caseScopeFor } = await import("../src/services/intelligenceAuthz.js");
    const noDistrict = { id: "u", name: "n", email: "e", role: "district_officer" as const };
    const scope = caseScopeFor(noDistrict as never);
    assert.equal(scope.kind, "denied", "a district role without a district must not be unrestricted");
  });

  test("LANDOWNER can read their own case but not another owner's", async () => {
    const owner = await loginAs(DEMO_EMAILS.landowner);
    const mine = await allCases(owner);
    assert.ok(mine.length > 0, "demo landowner should own at least one case");

    const allowed = await apiFetch(`/cases/${mine[0].id}`, { token: owner });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.data!.id, mine[0].id);

    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const foreign = await foreignCaseFor(owner, admin);
    const denied = await apiFetch(`/cases/${foreign.id}`, { token: owner });
    assert.equal(denied.status, 403);
  });

  test("LAND_AGENCY is denied both list and detail, matching the intelligence model", async () => {
    const token = await loginAs(DEMO_EMAILS.landAgency);
    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const anyCase = (await allCases(admin))[0];

    const list = await apiFetch("/cases", { token });
    assert.equal(list.status, 403);
    assert.equal(list.body.error?.code, "FORBIDDEN");

    const detail = await apiFetch(`/cases/${anyCase.id}`, { token });
    assert.equal(detail.status, 403);
  });

  test("unauthenticated access to cases is rejected (401)", async () => {
    const list = await apiFetch("/cases");
    assert.equal(list.status, 401);
  });
});

// ===========================================================================
// STEP 9 / 10 — direct object references on every Case 360 child
// ===========================================================================
describe("SECURITY: Case 360 children reject out-of-scope case ids", () => {
  const CHILDREN: { path: string; label: string }[] = [
    { path: "", label: "case detail" },
    { path: "/stages", label: "stages" },
    { path: "/documents", label: "documents" },
    { path: "/intelligence", label: "intelligence (mounted separately)" },
  ];

  for (const child of CHILDREN) {
    test(`district officer is refused another district's ${child.label}`, async () => {
      const token = await loginAs(DEMO_EMAILS.districtOfficer);
      const admin = await loginAs(DEMO_EMAILS.superAdmin);
      const own = await districtOf(token);
      const foreign = (await allCases(admin)).find((c) => c.districtId !== own);
      assert.ok(foreign);

      // intelligence lives under /api/intelligence/cases/:id
      const url = child.path === "/intelligence"
        ? `/intelligence/cases/${foreign.id}`
        : `/cases/${foreign.id}${child.path}`;

      const res = await apiFetch(url, { token });
      assert.ok(
        res.status === 403 || res.status === 404,
        `${child.label} returned ${res.status} for an out-of-scope case`,
      );
    });
  }

  test("landowner is refused another owner's case on every child route", async () => {
    const owner = await loginAs(DEMO_EMAILS.landowner);
    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const foreign = await foreignCaseFor(owner, admin);

    for (const path of ["", "/stages", "/documents"]) {
      const res = await apiFetch(`/cases/${foreign.id}${path}`, { token: owner });
      assert.ok(
        res.status === 403 || res.status === 404,
        `${path || "detail"} returned ${res.status} for a case the landowner does not own`,
      );
    }

    const intel = await apiFetch(`/intelligence/cases/${foreign.id}`, { token: owner });
    assert.ok(intel.status === 403 || intel.status === 404);
  });
});

// ===========================================================================
// STEP 13 — filter composition cannot bypass authorization
// ===========================================================================
describe("SECURITY: filters cannot widen authorization scope", () => {
  test("district filter for another district yields nothing, not everything", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const own = await districtOf(token);
    const other = (await allCases(admin)).find((c) => c.districtId !== own);
    assert.ok(other);

    const res = await apiFetch<CaseRow[]>(`/cases?districtId=${other.districtId}`, { token });
    assert.equal(res.status, 200);
    assert.equal(
      res.body.data!.length,
      0,
      "a district officer filtering on another district must get an empty intersection, not that district's cases",
    );
  });

  test("status filter combines with scope rather than replacing it", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const unfiltered = await allCases(token);
    const target = unfiltered[0].status;

    const res = await apiFetch<CaseRow[]>(`/cases?status=${target}`, { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.every((c) => c.status === target));
    assert.ok(res.body.data!.length <= unfiltered.length);
  });

  test("project filter cannot reach a project in another district", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const own = await districtOf(token);
    const foreign = (await allCases(admin)).find((c) => c.districtId !== own);
    assert.ok(foreign);

    const res = await apiFetch<CaseRow[]>(`/cases?projectId=${foreign.projectId}`, { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.length, 0);
  });

  test("search is scoped: it cannot surface another district's case number", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const own = await districtOf(token);
    const foreign = (await allCases(admin)).find((c) => c.districtId !== own);
    assert.ok(foreign);

    const res = await apiFetch<CaseRow[]>(`/cases?search=${encodeURIComponent(foreign.caseNumber)}`, { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.length, 0, "search leaked a case number outside the caller's district");
  });

  test("riskLevel filter is scoped", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const res = await apiFetch<CaseRow[]>("/cases?riskLevel=critical", { token });
    assert.equal(res.status, 200);
    const own = await districtOf(token);
    assert.ok(res.body.data!.every((c) => c.districtId === own));
  });
});

// ===========================================================================
// STEP 11 / 20 / 21 — aggregates and reports
// ===========================================================================
describe("SECURITY: aggregates do not disclose restricted cases", () => {
  test("dashboard totalCases never exceeds the cases the caller can list", async () => {
    const district = await loginAs(DEMO_EMAILS.districtOfficer);
    const owner = await loginAs(DEMO_EMAILS.landowner);
    const admin = await loginAs(DEMO_EMAILS.superAdmin);

    const adminTotal = (await allCases(admin)).length;

    for (const [label, token] of [["district officer", district], ["landowner", owner]] as const) {
      const dash = await apiFetch<{ kpi: { totalCases: number } }>("/dashboard", { token });
      assert.equal(dash.status, 200);
      const listed = (await allCases(token)).length;
      assert.ok(
        dash.body.data!.kpi.totalCases <= listed,
        `${label} dashboard reports ${dash.body.data!.kpi.totalCases} total cases but can only list ${listed}`,
      );
      assert.ok(
        dash.body.data!.kpi.totalCases < adminTotal,
        `${label} dashboard total (${dash.body.data!.kpi.totalCases}) matches the national total (${adminTotal})`,
      );
    }
  });

  test("priority alerts only reference cases the caller can see", async () => {
    const owner = await loginAs(DEMO_EMAILS.landowner);
    const mine = new Set((await allCases(owner)).map((c) => c.id));

    const dash = await apiFetch<{ priorityAlerts: { caseId: string }[] }>("/dashboard", { token: owner });
    assert.equal(dash.status, 200);
    for (const alert of dash.body.data!.priorityAlerts) {
      assert.ok(mine.has(alert.caseId), "alert referenced a case outside the caller's scope");
    }
  });

  test("analytics case counts are scoped", async () => {
    const owner = await loginAs(DEMO_EMAILS.landowner);
    const admin = await loginAs(DEMO_EMAILS.superAdmin);

    const mine = await apiFetch<{ caseStatus: { status: string; count: number }[] }>("/analytics", { token: owner });
    const all = await apiFetch<{ caseStatus: { status: string; count: number }[] }>("/analytics", { token: admin });
    assert.equal(mine.status, 200);

    const sumMine = mine.body.data!.caseStatus.reduce((s, r) => s + r.count, 0);
    const sumAll = all.body.data!.caseStatus.reduce((s, r) => s + r.count, 0);
    assert.equal(sumMine, (await allCases(owner)).length, "analytics total must match the scoped case list");
    assert.ok(sumMine < sumAll, "analytics disclosed the national case count to a landowner");
  });

  test("reports are scoped and cannot be pointed at another district", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const own = await districtOf(token);
    const other = (await allCases(admin)).find((c) => c.districtId !== own);
    assert.ok(other);

    const unfiltered = await apiFetch<{ district: string }[]>("/reports?type=progress", { token });
    assert.equal(unfiltered.status, 200);
    assert.ok(unfiltered.body.data!.every((r) => r.district !== other.districtName));

    const targeted = await apiFetch<unknown[]>("/reports?type=progress&districtId=" + other.districtId, { token });
    assert.equal(targeted.status, 200);
    assert.equal(targeted.body.data!.length, 0, "a report filtered to another district must be empty");
  });

  test("compensation is scoped — a landowner never sees other cases' amounts", async () => {
    const owner = await loginAs(DEMO_EMAILS.landowner);
    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const mine = new Set((await allCases(owner)).map((c) => c.id));

    const res = await apiFetch<{ caseId: string }[]>("/compensation", { token: owner });
    assert.equal(res.status, 200);
    for (const row of res.body.data!) {
      assert.ok(mine.has(row.caseId), "compensation row referenced a case outside the caller's scope");
    }

    const adminRes = await apiFetch<unknown[]>("/compensation", { token: admin });
    assert.ok(
      res.body.data!.length < adminRes.body.data!.length,
      "landowner saw as many compensation rows as the administrator",
    );
  });

  test("grievances are scoped", async () => {
    const district = await loginAs(DEMO_EMAILS.districtOfficer);
    const mine = new Set((await allCases(district)).map((c) => c.id));
    const res = await apiFetch<{ caseId: string | null }[]>("/grievances", { token: district });
    assert.equal(res.status, 200);
    for (const row of res.body.data!) {
      if (row.caseId) assert.ok(mine.has(row.caseId), "grievance referenced an out-of-scope case");
    }
  });

  test("documents remain scoped after the shared-model refactor", async () => {
    const owner = await loginAs(DEMO_EMAILS.landowner);
    const mine = new Set((await allCases(owner)).map((c) => c.id));
    const res = await apiFetch<{ caseId: string }[]>("/documents", { token: owner });
    assert.equal(res.status, 200);
    for (const row of res.body.data!) {
      assert.ok(mine.has(row.caseId), "document register leaked an out-of-scope case");
    }
  });
});

// ===========================================================================
// Parcel register — the case-independent surface
// ===========================================================================
describe("SECURITY: parcel register is scoped", () => {
  interface ParcelRow {
    id: string;
    ulpin: string;
    districtId: string;
    districtName: string;
    landownerRef: string | null;
  }

  test("parcel list is narrower for a district officer than for an admin", async () => {
    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const district = await loginAs(DEMO_EMAILS.districtOfficer);

    const all = await apiFetch<ParcelRow[]>("/parcels", { token: admin });
    const mine = await apiFetch<ParcelRow[]>("/parcels", { token: district });
    assert.equal(all.status, 200);
    assert.equal(mine.status, 200);
    assert.ok(mine.body.data!.length < all.body.data!.length, "parcel register appears unscoped");

    const expected = await districtOf(district);
    for (const p of mine.body.data!) {
      assert.equal(p.districtId, expected, "parcel outside the officer's district");
    }
  });

  test("landowner sees only their own parcels", async () => {
    const owner = await loginAs(DEMO_EMAILS.landowner);
    const res = await apiFetch<ParcelRow[]>("/parcels", { token: owner });
    assert.equal(res.status, 200);

    const mine = await apiFetch<{ id: string }[]>("/landowner/me/parcels", { token: owner });
    const owned = new Set((mine.body.data ?? []).map((p) => p.id));
    assert.ok(owned.size > 0, "demo landowner should own at least one parcel");
    for (const p of res.body.data!) {
      assert.ok(owned.has(p.id), "landowner was shown a parcel they do not own");
    }
  });

  test("land agency is denied the parcel register (403)", async () => {
    const token = await loginAs(DEMO_EMAILS.landAgency);
    const res = await apiFetch("/parcels", { token });
    assert.equal(res.status, 403);
  });

  test("an out-of-scope ULPIN returns 404, not 403 (no existence oracle)", async () => {
    const district = await loginAs(DEMO_EMAILS.districtOfficer);
    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const own = await districtOf(district);

    const all = await apiFetch<ParcelRow[]>("/parcels", { token: admin });
    const foreign = all.body.data!.find((p) => p.districtId !== own);
    assert.ok(foreign);

    const res = await apiFetch(`/parcels/${foreign.ulpin}`, { token: district });
    // 404 rather than 403: a 403 would confirm the ULPIN exists and turn the
    // endpoint into an enumeration oracle for land records.
    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, "PARCEL_NOT_FOUND");
  });

  test("a non-existent ULPIN is indistinguishable from an out-of-scope one", async () => {
    const district = await loginAs(DEMO_EMAILS.districtOfficer);
    // Well-formed but unallocated, so it passes the format validator and
    // reaches the same code path as an out-of-scope ULPIN.
    const res = await apiFetch("/parcels/RJ-08-999999999999", { token: district });
    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, "PARCEL_NOT_FOUND");
  });

  test("districtId filter on parcels narrows and cannot widen", async () => {
    const district = await loginAs(DEMO_EMAILS.districtOfficer);
    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const own = await districtOf(district);

    const all = await apiFetch<ParcelRow[]>("/parcels", { token: admin });
    const foreign = all.body.data!.find((p) => p.districtId !== own);
    assert.ok(foreign);

    const res = await apiFetch<ParcelRow[]>(`/parcels?districtId=${foreign.districtId}`, { token: district });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.length, 0, "filtering parcels on another district must yield nothing");
  });
});

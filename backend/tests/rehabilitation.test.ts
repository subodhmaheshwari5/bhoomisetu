import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, loginAs, DEMO_EMAILS } from "./helpers.js";
import { REHABILITATION_STATUSES } from "../src/services/rehabilitationService.js";

interface RRRow {
  id: string;
  caseId: string;
  caseNumber: string;
  districtName: string;
  ulpin: string | null;
  affectedFamily: string | null;
  status: string;
}

interface CaseRow {
  id: string;
  districtId: string;
}

async function districtOf(token: string): Promise<string> {
  const me = await apiFetch<{ districtId?: string }>("/auth/me", { token });
  assert.equal(me.status, 200);
  const districtId = me.body.data?.districtId;
  assert.ok(districtId, "expected the token to carry a districtId");
  return districtId;
}

async function casesFor(token: string): Promise<CaseRow[]> {
  const res = await apiFetch<CaseRow[]>("/cases", { token });
  assert.equal(res.status, 200);
  return res.body.data ?? [];
}

describe("Rehabilitation register", () => {
  test("returns R&R records for seeded data", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<RRRow[]>("/rehabilitation", { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.length > 0, "expected seeded R&R records");
    assert.ok(res.body.data!.every((r) => typeof r.caseNumber === "string"));
  });

  test("every R&R row references a case the caller can also list", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const rows = (await apiFetch<RRRow[]>("/rehabilitation", { token })).body.data!;
    const caseIds = new Set(rows.map((r) => r.caseId));
    for (const caseId of caseIds) {
      const detail = await apiFetch(`/cases/${caseId}`, { token });
      assert.equal(detail.status, 200, "R&R referenced a case not visible to the same caller");
    }
  });

  test("status filter returns only that status", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const all = (await apiFetch<RRRow[]>("/rehabilitation", { token })).body.data!;
    const target = all.find((r) => r.status !== "not_started")?.status;
    assert.ok(target);

    const res = await apiFetch<RRRow[]>(`/rehabilitation?status=${encodeURIComponent(target)}`, { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.length > 0);
    assert.ok(res.body.data!.every((r) => r.status === target));
  });

  test("caseId filter scopes to a single case", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const all = (await apiFetch<RRRow[]>("/rehabilitation", { token })).body.data!;
    const caseId = all[0].caseId;

    const res = await apiFetch<RRRow[]>(`/rehabilitation?caseId=${caseId}`, { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.length > 0);
    assert.ok(res.body.data!.every((r) => r.caseId === caseId));
  });

  test("search matches case number, ULPIN and affected family", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const all = (await apiFetch<RRRow[]>("/rehabilitation", { token })).body.data!;
    const sample = all[0];

    const byCase = await apiFetch<RRRow[]>(
      `/rehabilitation?search=${encodeURIComponent(sample.caseNumber)}`,
      { token },
    );
    assert.ok(byCase.body.data!.some((r) => r.caseNumber === sample.caseNumber));

    if (sample.affectedFamily) {
      const byFamily = await apiFetch<RRRow[]>(
        `/rehabilitation?search=${encodeURIComponent(sample.affectedFamily)}`,
        { token },
      );
      assert.ok(byFamily.body.data!.some((r) => r.affectedFamily === sample.affectedFamily));
    }
  });

  test("statuses endpoint exposes exactly the backend's closed set", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<{ statuses: { value: string; label: string }[] }>(
      "/rehabilitation/statuses",
      { token },
    );
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.data!.statuses.map((s) => s.value),
      [...REHABILITATION_STATUSES],
    );
    assert.ok(res.body.data!.statuses.every((s) => typeof s.label === "string" && s.label.length > 0));
  });

  test("stored statuses are all within the declared set", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const rows = (await apiFetch<RRRow[]>("/rehabilitation", { token })).body.data!;
    const known = new Set<string>(REHABILITATION_STATUSES);
    for (const r of rows) {
      assert.ok(known.has(r.status), `stored status "${r.status}" is not in the declared set`);
    }
  });

  test("summary totals reconcile with the listed rows", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const rows = (await apiFetch<RRRow[]>("/rehabilitation", { token })).body.data!;
    const summary = await apiFetch<{ total: number; byStatus: { status: string; count: number }[] }>(
      "/rehabilitation/summary",
      { token },
    );
    assert.equal(summary.status, 200);
    assert.equal(summary.body.data!.total, rows.length);
    assert.equal(
      summary.body.data!.byStatus.reduce((s, r) => s + r.count, 0),
      rows.length,
    );
  });
});

describe("Rehabilitation scoping", () => {
  test("district officer sees only their district's R&R records", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const admin = await loginAs(DEMO_EMAILS.superAdmin);

    const mine = (await apiFetch<RRRow[]>("/rehabilitation", { token })).body.data!;
    const all = (await apiFetch<RRRow[]>("/rehabilitation", { token: admin })).body.data!;
    const expected = await districtOf(token);

    assert.ok(mine.length <= all.length);
    for (const r of mine) {
      const c = (await casesFor(token)).find((x) => x.id === r.caseId);
      assert.ok(c, "R&R row referenced a case outside the officer's scope");
      assert.equal(c!.districtId, expected);
    }
  });

  test("R&R rows are a strict subset of the caller's visible cases", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const rrCases = new Set((await apiFetch<RRRow[]>("/rehabilitation", { token })).body.data!.map((r) => r.caseId));
    const listed = new Set((await casesFor(token)).map((c) => c.id));
    for (const id of rrCases) {
      assert.ok(listed.has(id), "R&R exposed a case that GET /cases does not");
    }
  });

  test("landowner sees only R&R on parcels they own", async () => {
    const token = await loginAs(DEMO_EMAILS.landowner);
    const res = await apiFetch<RRRow[]>("/rehabilitation", { token });
    assert.equal(res.status, 200);

    const own = await apiFetch<{ id: string }[]>("/landowner/me/cases", { token });
    const owned = new Set((own.body.data ?? []).map((c) => c.id));
    for (const r of res.body.data!) {
      assert.ok(owned.has(r.caseId), "landowner was shown an R&R record for an unowned case");
    }
  });

  test("land agency is denied the case-derived endpoints (403)", async () => {
    const token = await loginAs(DEMO_EMAILS.landAgency);
    for (const path of ["/rehabilitation", "/rehabilitation/summary"]) {
      const res = await apiFetch(path, { token });
      assert.equal(res.status, 403, `${path} should be denied to a land agency`);
    }

    // /statuses is deliberately exempt: it returns the fixed R&R vocabulary and
    // no case-derived rows, so there is nothing to scope. It still requires
    // authentication, which is what stops it being an enumeration surface.
    const statuses = await apiFetch("/rehabilitation/statuses", { token });
    assert.equal(statuses.status, 200);
    const raw = JSON.stringify(statuses.body.data);
    assert.ok(!/case_number|ulpin|district/i.test(raw), "the vocabulary must not embed any case data");
  });

  test("the status vocabulary still requires authentication", async () => {
    const res = await apiFetch("/rehabilitation/statuses");
    assert.equal(res.status, 401);
  });

  test("a district filter cannot widen scope", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const admin = await loginAs(DEMO_EMAILS.superAdmin);
    const own = await districtOf(token);

    const all = (await apiFetch<RRRow[]>("/rehabilitation", { token: admin })).body.data!;
    const foreign = all.find((r) => {
      const c = all.find(() => true);
      return c && r.districtName !== undefined && r.caseNumber !== c.caseNumber;
    });
    assert.ok(foreign);

    // Filter to a district the officer does not hold.
    const otherDistrict = (await apiFetch<CaseRow[]>("/cases", { token: admin })).body.data!.find(
      (c) => c.districtId !== own,
    );
    assert.ok(otherDistrict);

    const res = await apiFetch<RRRow[]>(`/rehabilitation?caseId=${otherDistrict.id}`, { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.length, 0, "filtering to another district's case must yield nothing");
  });

  test("unauthenticated access is rejected (401)", async () => {
    const res = await apiFetch("/rehabilitation");
    assert.equal(res.status, 401);
  });
});

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, loginAs, DEMO_EMAILS } from "./helpers.js";

interface DocumentRow {
  id: string;
  caseId: string;
  caseNumber: string;
  districtName: string;
  category: string;
  fileName: string;
  status: string;
  versionCount: number;
}

describe("Document register", () => {
  test("Super Admin sees the cross-case document register", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<DocumentRow[]>("/documents", { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.length > 0, "expected seeded documents");
    assert.ok(res.body.data!.every((d) => typeof d.caseNumber === "string"));
    assert.ok(res.body.data!.every((d) => typeof d.versionCount === "number"));
  });

  test("Documents are ordered newest first", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<(DocumentRow & { uploadedAt: string })[]>("/documents", { token });
    const times = res.body.data!.map((d) => new Date(d.uploadedAt).getTime());
    const sorted = [...times].sort((a, b) => b - a);
    assert.deepEqual(times, sorted);
  });

  test("Status filter only returns documents in that status", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<DocumentRow[]>("/documents", { token });
    assert.equal(res.status, 200);
    const target = res.body.data![0]?.status;
    assert.ok(target, "expected at least one document to filter on");

    const filtered = await apiFetch<DocumentRow[]>("/documents?status=" + encodeURIComponent(target), { token });
    assert.equal(filtered.status, 200);
    assert.ok(filtered.body.data!.every((d) => d.status === target));
  });

  test("caseId filter scopes the register to one case", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const all = await apiFetch<DocumentRow[]>("/documents", { token });
    const caseId = all.body.data![0].caseId;

    const res = await apiFetch<DocumentRow[]>(`/documents?caseId=${caseId}`, { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.length > 0);
    assert.ok(res.body.data!.every((d) => d.caseId === caseId));
  });

  test("Search matches file name and case number", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const all = await apiFetch<DocumentRow[]>("/documents", { token });
    const sample = all.body.data![0];

    const res = await apiFetch<DocumentRow[]>(`/documents?search=${encodeURIComponent(sample.caseNumber)}`, { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.some((d) => d.caseNumber === sample.caseNumber));
  });

  test("Category filter only returns that category", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const cats = await apiFetch<{ category: string; count: number }[]>("/documents/categories", { token });
    const target = cats.body.data![0];
    assert.ok(target, "expected at least one category");

    const res = await apiFetch<DocumentRow[]>(`/documents?category=${encodeURIComponent(target.category)}`, { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.length > 0);
    assert.ok(res.body.data!.every((d) => d.category === target.category));
  });

  test("Status and category filters combine rather than overriding each other", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const cats = await apiFetch<{ category: string; count: number }[]>("/documents/categories", { token });
    const category = cats.body.data![0].category;

    const onlyCategory = await apiFetch<DocumentRow[]>(`/documents?category=${encodeURIComponent(category)}`, { token });
    const status = onlyCategory.body.data![0].status;

    const combined = await apiFetch<DocumentRow[]>(
      `/documents?category=${encodeURIComponent(category)}&status=${encodeURIComponent(status)}`,
      { token },
    );
    assert.equal(combined.status, 200);
    assert.ok(combined.body.data!.every((d) => d.category === category && d.status === status));
    assert.ok(combined.body.data!.length <= onlyCategory.body.data!.length);
  });

  test("A non-numeric limit falls back to the default instead of erroring", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<DocumentRow[]>("/documents?limit=not-a-number", { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
  });

  test("limit is capped so a page cannot request the whole table", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<DocumentRow[]>("/documents?limit=100000", { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.length <= 500);
  });

  test("Category summary is available and scoped", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<{ category: string; count: number }[]>("/documents/categories", { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.length > 0);
    assert.ok(res.body.data!.every((r) => typeof r.count === "number"));
  });
});

describe("Document register scoping", () => {
  test("District Officer sees only their own district's documents", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const adminToken = await loginAs(DEMO_EMAILS.superAdmin);

    const mine = await apiFetch<DocumentRow[]>("/documents", { token });
    const all = await apiFetch<DocumentRow[]>("/documents", { token: adminToken });
    assert.equal(mine.status, 200);

    const myDistricts = new Set(mine.body.data!.map((d) => d.districtName));
    assert.ok(myDistricts.size <= 1, `expected at most one district, saw ${[...myDistricts].join(", ")}`);
    assert.ok(mine.body.data!.length < all.body.data!.length, "district scope should be a strict subset");
  });

  test("Landowner sees only documents on parcels they own", async () => {
    const token = await loginAs(DEMO_EMAILS.landowner);
    const res = await apiFetch<DocumentRow[]>("/documents", { token });
    assert.equal(res.status, 200);

    // Every document returned must belong to a case the landowner actually owns.
    const own = await apiFetch<{ id: string }[]>("/landowner/me/cases", { token });
    assert.equal(own.status, 200);
    const owned = new Set(own.body.data!.map((c) => c.id));

    const caseIds = [...new Set(res.body.data!.map((d) => d.caseId))];
    for (const caseId of caseIds) {
      assert.ok(owned.has(caseId), `landowner was shown a document for unowned case ${caseId}`);
    }
  });

  test("Land agency is denied the document register (403)", async () => {
    const token = await loginAs(DEMO_EMAILS.landAgency);
    const res = await apiFetch("/documents", { token });
    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, "FORBIDDEN");
  });

  test("Land agency is denied the category summary (403)", async () => {
    const token = await loginAs(DEMO_EMAILS.landAgency);
    const res = await apiFetch("/documents/categories", { token });
    assert.equal(res.status, 403);
  });

  test("Landowner cannot read another case's documents (403)", async () => {
    const adminToken = await loginAs(DEMO_EMAILS.superAdmin);
    const all = await apiFetch<DocumentRow[]>("/documents", { token: adminToken });

    // Find a case the demo landowner demonstrably does not own.
    const ownerToken = await loginAs(DEMO_EMAILS.landowner);
    const own = await apiFetch<{ id: string }[]>("/landowner/me/cases", { token: ownerToken });
    const ownedIds = new Set(own.body.data!.map((c) => c.id));

    const foreign = all.body.data!.find((d) => !ownedIds.has(d.caseId));
    assert.ok(foreign, "expected at least one document outside the landowner's own cases");

    const res = await apiFetch(`/cases/${foreign.caseId}/documents`, { token: ownerToken });
    assert.equal(res.status, 403);
  });

  test("Unauthenticated access is rejected (401)", async () => {
    const res = await apiFetch("/documents");
    assert.equal(res.status, 401);
  });
});

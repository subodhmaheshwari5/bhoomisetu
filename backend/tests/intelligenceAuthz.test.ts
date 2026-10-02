import { test } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, loginAs, DEMO_EMAILS } from "./helpers.js";

/**
 * Authorization and the human-verification workflow.
 *
 * The resolution path is the one place where the system turns into
 * "institutional knowledge", so it is deliberately the most tightly guarded:
 *   - a district officer cannot read another district's case analysis
 *   - a landowner can only ever see their own parcel, redacted
 *   - a recorder cannot verify their own resolution
 *   - an unverified resolution is never retrievable as precedent
 */

interface CaseRow {
  id: string;
  caseNumber: string;
  districtId: string;
}

async function listCases(token: string): Promise<CaseRow[]> {
  const res = await apiFetch<CaseRow[]>("/cases", { token });
  return res.body.data ?? [];
}

/**
 * The landowner's OWN cases, via the properly-scoped endpoint.
 *
 * Must not use GET /cases here: that endpoint returns every case to any
 * authenticated role, so its first row is not necessarily the landowner's.
 */
async function landownerOwnCases(token: string): Promise<CaseRow[]> {
  const res = await apiFetch<CaseRow[]>("/landowner/me/cases", { token });
  return res.body.data ?? [];
}

const RESOLUTION_BODY = {
  problemType: "approval_blocker",
  problemDescription: "Compensation approval remained pending past the service standard.",
  rootCause: "Valuation supporting document was uploaded late.",
  actionTaken: "Reopened the approval workflow after the valuation was verified.",
  responsibleDepartment: "District Collector Office",
  resolution: "Approval completed after the valuation document was verified.",
  outcome: "Compensation approved.",
};

test("Intelligence authorization and verification", async (t) => {
  const adminToken = await loginAs(DEMO_EMAILS.superAdmin);
  const districtToken = await loginAs(DEMO_EMAILS.districtOfficer);
  const stateToken = await loginAs(DEMO_EMAILS.stateOfficer);
  const landownerToken = await loginAs(DEMO_EMAILS.landowner);
  const agencyToken = await loginAs(DEMO_EMAILS.landAgency);

  const flagship = (await listCases(adminToken)).find((c) => c.caseNumber === "BS-2026-00124")!;
  assert.ok(flagship);

  // ---------------------------------------------------------------------
  await t.test("district officer gets a populated districtId on the token", async () => {
    // districtId was previously selected from the DB and then dropped, which
    // silently disabled every district-scoped check.
    const me = await apiFetch<{ role: string; districtId?: string }>("/auth/me", { token: districtToken });
    assert.equal(me.status, 200);
    assert.equal(me.body.data?.role, "district_officer");
    assert.ok(me.body.data?.districtId, "district officer must carry a districtId");
  });

  // ---------------------------------------------------------------------
  await t.test("district officer can analyze a case in their own district", async () => {
    const res = await apiFetch(`/intelligence/cases/${flagship.id}`, { token: districtToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.caseNumber, "BS-2026-00124");
  });

  // ---------------------------------------------------------------------
  await t.test("district officer is refused a case in another district", async () => {
    // Find a case whose district differs from the district officer's.
    const own = await apiFetch<{ id: string; districtId: string }>("/auth/me", { token: districtToken });
    const ownDistrict = own.body.data?.districtId;
    assert.ok(ownDistrict);

    const foreign = (await listCases(adminToken)).find((c) => c.districtId !== ownDistrict);
    if (!foreign) {
      // Only one district is present in this seed; nothing to assert.
      return;
    }

    const res = await apiFetch(`/intelligence/cases/${foreign.id}`, { token: districtToken });
    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, "FORBIDDEN");
  });

  // ---------------------------------------------------------------------
  await t.test("landowner can analyze only their own parcel, and sees a redacted payload", async () => {
    const own = await landownerOwnCases(landownerToken);
    assert.ok(own.length > 0, "landowner should be scoped to at least one case");

    const res = await apiFetch<Record<string, unknown>>(
      `/intelligence/cases/${own[0].id}`,
      { token: landownerToken },
    );
    assert.equal(res.status, 200);

    // Financial figures must not reach a landowner.
    const raw = JSON.stringify(res.body.data);
    assert.ok(!/assessment_amount|assessmentAmount/.test(raw), "landowner must not receive compensation amounts");
    assert.ok(!/INR\s?\d/.test(raw), "landowner must not receive rupee amounts");
  });

  // ---------------------------------------------------------------------
  await t.test("landowner is refused a case on a parcel they do not own", async () => {
    const ownIds = new Set((await landownerOwnCases(landownerToken)).map((c) => c.id));
    const foreign = (await listCases(adminToken)).find((c) => !ownIds.has(c.id));
    if (!foreign) return;

    const res = await apiFetch(`/intelligence/cases/${foreign.id}`, { token: landownerToken });
    assert.equal(res.status, 403);
  });

  // ---------------------------------------------------------------------
  await t.test("land agency cannot read case intelligence at all", async () => {
    const res = await apiFetch(`/intelligence/cases/${flagship.id}`, { token: agencyToken });
    assert.equal(res.status, 403);
  });

  // ---------------------------------------------------------------------
  await t.test("verified precedents are officer-only", async () => {
    const officer = await apiFetch("/intelligence/precedents", { token: districtToken });
    assert.equal(officer.status, 200);

    const landowner = await apiFetch("/intelligence/precedents", { token: landownerToken });
    assert.equal(landowner.status, 403);
  });

  // ---------------------------------------------------------------------
  await t.test("a landowner cannot record a resolution", async () => {
    const own = await landownerOwnCases(landownerToken);
    const res = await apiFetch(`/intelligence/cases/${own[0].id}/resolutions`, {
      method: "POST",
      token: landownerToken,
      body: RESOLUTION_BODY,
    });
    assert.equal(res.status, 403);
  });

  // ---------------------------------------------------------------------
  await t.test("a district officer may not verify a resolution (verification is a senior act)", async () => {
    const created = await apiFetch<{ id: string; status: string }>(
      `/intelligence/cases/${flagship.id}/resolutions`,
      { method: "POST", token: districtToken, body: RESOLUTION_BODY },
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.data?.status, "draft");

    const resolutionId = created.body.data!.id;

    const submitted = await apiFetch(`/intelligence/resolutions/${resolutionId}/submit`, {
      method: "POST",
      token: districtToken,
    });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.data.status, "submitted");

    // The same officer must not be able to verify it.
    const selfVerify = await apiFetch(`/intelligence/resolutions/${resolutionId}/verify`, {
      method: "POST",
      token: districtToken,
    });
    assert.equal(selfVerify.status, 403);
  });

  // ---------------------------------------------------------------------
  await t.test("a senior officer can verify, and only then does it become precedent", async () => {
    // Fresh draft recorded by the district officer, verified by the state officer.
    const created = await apiFetch<{ id: string }>(`/intelligence/cases/${flagship.id}/resolutions`, {
      method: "POST",
      token: districtToken,
      body: { ...RESOLUTION_BODY, problemType: "payment_blocker" },
    });
    const resolutionId = created.body.data!.id;

    await apiFetch(`/intelligence/resolutions/${resolutionId}/submit`, {
      method: "POST",
      token: districtToken,
    });

    const verified = await apiFetch<{ status: string; verifiedByName: string }>(
      `/intelligence/resolutions/${resolutionId}/verify`,
      { method: "POST", token: stateToken },
    );
    assert.equal(verified.status, 200);
    assert.equal(verified.body.data.status, "verified");
    assert.ok(verified.body.data.verifiedByName, "verification must record who verified");

    const precedents = await apiFetch<Array<{ resolutionId: string }>>("/intelligence/precedents", {
      token: stateToken,
    });
    assert.ok(
      precedents.body.data?.some((p) => p.resolutionId === resolutionId),
      "a verified resolution must appear in institutional memory",
    );
  });

  // ---------------------------------------------------------------------
  await t.test("an unverified resolution is never retrievable as precedent", async () => {
    const created = await apiFetch<{ id: string }>(`/intelligence/cases/${flagship.id}/resolutions`, {
      method: "POST",
      token: districtToken,
      body: { ...RESOLUTION_BODY, problemType: "document_blocker" },
    });
    const draftId = created.body.data!.id;
    await apiFetch(`/intelligence/resolutions/${draftId}/submit`, { method: "POST", token: districtToken });

    const precedents = await apiFetch<Array<{ resolutionId: string }>>("/intelligence/precedents", {
      token: stateToken,
    });
    assert.ok(
      !precedents.body.data?.some((p) => p.resolutionId === draftId),
      "a submitted-but-unverified resolution must not be institutional knowledge",
    );
  });

  // ---------------------------------------------------------------------
  await t.test("a rejected resolution is never retrievable as precedent", async () => {
    const created = await apiFetch<{ id: string }>(`/intelligence/cases/${flagship.id}/resolutions`, {
      method: "POST",
      token: districtToken,
      body: { ...RESOLUTION_BODY, problemType: "grievance_blocker" },
    });
    const id = created.body.data!.id;

    await apiFetch(`/intelligence/resolutions/${id}/submit`, { method: "POST", token: districtToken });

    const rejected = await apiFetch<{ status: string; rejectionReason: string }>(
      `/intelligence/resolutions/${id}/reject`,
      { method: "POST", token: stateToken, body: { reason: "Root cause not evidenced in the record." } },
    );
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.data.status, "rejected");
    assert.ok(rejected.body.data.rejectionReason, "a rejection must be explained for audit");

    const precedents = await apiFetch<Array<{ resolutionId: string }>>("/intelligence/precedents", {
      token: stateToken,
    });
    assert.ok(!precedents.body.data?.some((p) => p.resolutionId === id));
  });

  // ---------------------------------------------------------------------
  await t.test("an invalid status transition is refused", async () => {
    const created = await apiFetch<{ id: string }>(`/intelligence/cases/${flagship.id}/resolutions`, {
      method: "POST",
      token: districtToken,
      body: RESOLUTION_BODY,
    });
    const id = created.body.data!.id;

    // Cannot verify straight from draft.
    const res = await apiFetch(`/intelligence/resolutions/${id}/verify`, {
      method: "POST",
      token: stateToken,
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "INVALID_RESOLUTION_TRANSITION");
  });

  // ---------------------------------------------------------------------
  await t.test("resolution input is validated", async () => {
    const res = await apiFetch(`/intelligence/cases/${flagship.id}/resolutions`, {
      method: "POST",
      token: districtToken,
      body: { ...RESOLUTION_BODY, problemType: "not_a_real_blocker" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, "VALIDATION_ERROR");
  });

  // ---------------------------------------------------------------------
  await t.test("similar cases report categorical match, never a fabricated percentage", async () => {
    const res = await apiFetch<{ similarCases: Array<{ match: { level: string; matchedOn: string[] } }> }>(
      `/intelligence/cases/${flagship.id}/similar-cases`,
      { token: adminToken },
    );
    assert.equal(res.status, 200);
    for (const s of res.body.data?.similarCases ?? []) {
      assert.ok(["high", "moderate", "low"].includes(s.match.level));
      assert.ok(Array.isArray(s.match.matchedOn));
    }
    const raw = JSON.stringify(res.body.data);
    assert.ok(!/\d{1,3}%/.test(raw), "no similarity percentage may be fabricated");
  });
});

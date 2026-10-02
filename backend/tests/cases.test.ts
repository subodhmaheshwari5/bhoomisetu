import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, loginAs, DEMO_EMAILS } from "./helpers.js";

/** The caller's own district, from the token. Fails the test if absent. */
async function districtOf(token: string): Promise<string> {
  const me = await apiFetch<{ districtId?: string }>("/auth/me", { token });
  assert.equal(me.status, 200);
  const districtId = me.body.data?.districtId;
  assert.ok(districtId, "expected the token to carry a districtId");
  return districtId;
}

describe("Case retrieval", () => {
  test("GET /cases returns a list with the flagship demo case", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const res = await apiFetch<{ caseNumber: string }[]>("/cases", { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.some((c) => c.caseNumber === "BS-2026-00124"));
  });

  test("GET /cases/:id returns full case detail", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const listRes = await apiFetch<{ id: string }[]>("/cases", { token });
    const caseId = listRes.body.data![0].id;

    const res = await apiFetch<{ id: string; currentStage: number }>(`/cases/${caseId}`, { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.id, caseId);
    assert.ok(res.body.data!.currentStage >= 1 && res.body.data!.currentStage <= 10);
  });

  test("GET /cases/:id for a non-existent id returns 404", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const res = await apiFetch("/cases/00000000-0000-0000-0000-000000000000", { token });
    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, "CASE_NOT_FOUND");
  });

  test("GET /cases/:id/stages returns exactly 10 stages", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const listRes = await apiFetch<{ id: string }[]>("/cases", { token });
    const caseId = listRes.body.data![0].id;

    const res = await apiFetch<unknown[]>(`/cases/${caseId}/stages`, { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.length, 10);
  });
});

describe("Stage updates", () => {
  test("Officer can update a stage's remarks, and it's reflected on refetch", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const casesRes = await apiFetch<{ id: string }[]>("/cases", { token });
    const caseId = casesRes.body.data![0].id;
    const stagesRes = await apiFetch<{ id: string }[]>(`/cases/${caseId}/stages`, { token });
    const stageId = stagesRes.body.data![0].id;

    const marker = `Test remark ${Date.now()}`;
    const putRes = await apiFetch<{ remarks: string }>(`/cases/${caseId}/stages/${stageId}`, {
      method: "PUT",
      token,
      body: { remarks: marker },
    });
    assert.equal(putRes.status, 200);
    assert.equal(putRes.body.data!.remarks, marker);

    const refetch = await apiFetch<{ id: string; remarks: string }[]>(`/cases/${caseId}/stages`, { token });
    const updated = refetch.body.data!.find((s) => s.id === stageId);
    assert.equal(updated?.remarks, marker);
  });

  test("Updating a stage that doesn't belong to the case returns 404", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const casesRes = await apiFetch<{ id: string }[]>("/cases", { token });
    const caseId = casesRes.body.data![0].id;

    const res = await apiFetch(`/cases/${caseId}/stages/00000000-0000-0000-0000-000000000000`, {
      method: "PUT",
      token,
      body: { remarks: "should not apply" },
    });
    assert.equal(res.status, 404);
  });
});

describe("Case status contract", () => {
  // Regression guard. The `case_status` enum carries six values, but the
  // request validators originally accepted only the original four, so
  // `in_progress` and `on_hold` were stored-unreachable: the database allowed
  // them while every API request carrying one was rejected with a 400. This
  // asserts the validators and the enum agree, in both directions.
  const ALL_STATUSES = ["on_track", "in_progress", "at_risk", "delayed", "completed", "on_hold"] as const;

  /**
   * Creates a throwaway case for this suite to mutate.
   *
   * Deliberately does NOT reuse a seeded case. Flipping a seeded case's status
   * bumps its `updated_at`, which reorders `/landowner/me/cases`; test files
   * share one database, so that perturbed a concurrently running suite's
   * "landowner's first case" and made it flaky. The parcel is also chosen to be
   * one the demo landowner does not own, for the same reason.
   */
  async function createScratchCase(token: string): Promise<{ id: string; status: string }> {
    // The case must be created inside the OFFICER's own district, otherwise the
    // subsequent PUT is (correctly) refused by the new case-scope check and the
    // test would be asserting on a 403 rather than on status validation.
    const districtId = await districtOf(token);

    const projectsRes = await apiFetch<{ id: string; districtId: string }[]>("/projects", { token });
    const project =
      projectsRes.body.data!.find((p) => p.districtId === districtId) ?? projectsRes.body.data![0];
    assert.ok(project);

    const ownerToken = await loginAs(DEMO_EMAILS.landowner);
    const ownedRes = await apiFetch<{ id: string }[]>("/landowner/me/parcels", { token: ownerToken });
    const owned = new Set((ownedRes.body.data ?? []).map((p) => p.id));

    const parcelsRes = await apiFetch<{ id: string }[]>("/parcels", { token });
    const parcel = parcelsRes.body.data!.find((p) => !owned.has(p.id));
    assert.ok(parcel, "expected at least one parcel not owned by the demo landowner");

    const created = await apiFetch<{ id: string; status: string }>("/cases", {
      method: "POST",
      token,
      body: {
        projectId: project.id,
        parcelId: parcel.id,
        districtId,
        assignedOfficer: "Status Contract Test",
      },
    });
    assert.equal(created.status, 201);
    return created.body.data!;
  }

  for (const status of ALL_STATUSES) {
    test(`PUT /cases/:id accepts status "${status}"`, async () => {
      const token = await loginAs(DEMO_EMAILS.districtOfficer);
      const scratch = await createScratchCase(token);

      const res = await apiFetch<{ status: string }>(`/cases/${scratch.id}`, {
        method: "PUT",
        token,
        body: { status },
      });
      assert.equal(res.status, 200, `status "${status}" was rejected: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data!.status, status);
    });
  }

  test("PUT /cases/:id still rejects a status outside the enum", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const listRes = await apiFetch<{ id: string }[]>("/cases", { token });
    const caseId = listRes.body.data![0].id;

    const res = await apiFetch(`/cases/${caseId}`, {
      method: "PUT",
      token,
      body: { status: "not_a_real_status" },
    });
    assert.equal(res.status, 400);
  });
});

describe("Compensation", () => {
  test("GET /compensation returns records linked to real cases", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const res = await apiFetch<{ caseNumber: string; approvalStatus: string }[]>("/compensation", { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data!.length > 0);
    assert.ok(res.body.data!.every((row) => typeof row.caseNumber === "string"));
  });
});

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, loginAs, DEMO_EMAILS } from "./helpers.js";

describe("Authorization (RBAC)", () => {
  test("Landowner cannot create a case (403)", async () => {
    const token = await loginAs(DEMO_EMAILS.landowner);
    const projectsRes = await apiFetch<{ id: string; districtId: string }[]>("/projects", { token });
    const parcelsRes = await apiFetch<{ id: string }[]>("/parcels", { token });
    const project = projectsRes.body.data![0];
    const parcel = parcelsRes.body.data![1];

    const res = await apiFetch("/cases", {
      method: "POST",
      token,
      body: { projectId: project.id, parcelId: parcel.id, districtId: project.districtId, assignedOfficer: "Test" },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, "FORBIDDEN");
  });

  test("District Officer can create a case in their own district (201)", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);

    // The case must be opened in the OFFICER's own district. `POST /cases` now
    // enforces write scope, because districtId arrives in the request body and a
    // district officer could otherwise open a case in a district they cannot read.
    const me = await apiFetch<{ districtId?: string }>("/auth/me", { token });
    const districtId = me.body.data?.districtId;
    assert.ok(districtId, "district officer token should carry a districtId");

    const projectsRes = await apiFetch<{ id: string; districtId: string }[]>("/projects", { token });
    const project =
      projectsRes.body.data!.find((p) => p.districtId === districtId) ?? projectsRes.body.data![0];
    const parcelsRes = await apiFetch<{ id: string }[]>("/parcels", { token });
    const parcel = parcelsRes.body.data![2];

    const res = await apiFetch<{ caseNumber: string }>("/cases", {
      method: "POST",
      token,
      body: { projectId: project.id, parcelId: parcel.id, districtId, assignedOfficer: "Test Officer" },
    });
    assert.equal(res.status, 201);
    assert.match(res.body.data!.caseNumber, /^BS-\d{4}-\d{5}$/);
  });

  test("District Officer cannot create a case in another district (403)", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const adminToken = await loginAs(DEMO_EMAILS.superAdmin);

    const me = await apiFetch<{ districtId?: string }>("/auth/me", { token });
    const ownDistrict = me.body.data?.districtId;
    assert.ok(ownDistrict);

    // Find a project in a different district via the unrestricted admin view.
    const projectsRes = await apiFetch<{ id: string; districtId: string }[]>("/projects", { token: adminToken });
    const foreign = projectsRes.body.data!.find((p) => p.districtId !== ownDistrict);
    assert.ok(foreign, "expected a project outside the officer's district");

    const parcelsRes = await apiFetch<{ id: string }[]>("/parcels", { token });
    const parcel = parcelsRes.body.data![0];

    const res = await apiFetch("/cases", {
      method: "POST",
      token,
      body: {
        projectId: foreign.id,
        parcelId: parcel.id,
        districtId: foreign.districtId,
        assignedOfficer: "Test Officer",
      },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, "FORBIDDEN");
  });

  test("Landowner cannot update a case (403)", async () => {
    const officerToken = await loginAs(DEMO_EMAILS.districtOfficer);
    const casesRes = await apiFetch<{ id: string }[]>("/cases", { token: officerToken });
    const caseId = casesRes.body.data![0].id;

    const landownerToken = await loginAs(DEMO_EMAILS.landowner);
    const res = await apiFetch(`/cases/${caseId}`, { method: "PUT", token: landownerToken, body: { status: "completed" } });
    assert.equal(res.status, 403);
  });

  test("Landowner cannot see another case's risk score (403)", async () => {
    const officerToken = await loginAs(DEMO_EMAILS.districtOfficer);
    const casesRes = await apiFetch<{ id: string }[]>("/cases", { token: officerToken });
    const caseId = casesRes.body.data![0].id;

    const landownerToken = await loginAs(DEMO_EMAILS.landowner);
    const res = await apiFetch(`/cases/${caseId}/risk-score`, { token: landownerToken });
    assert.equal(res.status, 403);
  });

  test("Landowner cannot trigger the admin alert scan (403)", async () => {
    const token = await loginAs(DEMO_EMAILS.landowner);
    const res = await apiFetch("/admin/alerts/run", { method: "POST", token });
    assert.equal(res.status, 403);
  });

  test("Super Admin can trigger the admin alert scan (200)", async () => {
    const token = await loginAs(DEMO_EMAILS.superAdmin);
    const res = await apiFetch<{ notificationsCreated: number }>("/admin/alerts/run", { method: "POST", token });
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.data?.notificationsCreated === "number");
  });

  test("Any authenticated role (incl. Landowner) can submit a grievance", async () => {
    const token = await loginAs(DEMO_EMAILS.landowner);
    const res = await apiFetch<{ grievanceNumber: string }>("/grievances", {
      method: "POST",
      token,
      body: { category: "Compensation", description: "Automated test grievance submission." },
    });
    assert.equal(res.status, 201);
    assert.match(res.body.data!.grievanceNumber, /^GRV-\d{4}-\d{4}$/);
  });

  test("Landowner cannot update a grievance's status (403)", async () => {
    const grievancesToken = await loginAs(DEMO_EMAILS.districtOfficer);
    const grievancesRes = await apiFetch<{ id: string }[]>("/grievances", { token: grievancesToken });
    const grievanceId = grievancesRes.body.data![0].id;

    const landownerToken = await loginAs(DEMO_EMAILS.landowner);
    const res = await apiFetch(`/grievances/${grievanceId}`, { method: "PUT", token: landownerToken, body: { status: "resolved" } });
    assert.equal(res.status, 403);
  });
});

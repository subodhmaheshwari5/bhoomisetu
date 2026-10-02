import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, loginAs, DEMO_EMAILS } from "./helpers.js";

describe("API validation", () => {
  test("malformed ULPIN returns 400 with a helpful message", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const res = await apiFetch("/parcels/not-a-ulpin", { token });
    assert.equal(res.status, 400);
    assert.match(res.body.error!.message, /ULPIN/);
  });

  test("well-formed but unknown ULPIN returns 404", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const res = await apiFetch("/parcels/ZZ-99-999999999999", { token });
    assert.equal(res.status, 404);
  });

  test("grievance description below the minimum length is rejected (400)", async () => {
    const token = await loginAs(DEMO_EMAILS.landowner);
    const res = await apiFetch("/grievances", {
      method: "POST",
      token,
      body: { category: "Compensation", description: "short" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, "VALIDATION_ERROR");
  });

  test("grievance with an invalid category is rejected (400)", async () => {
    const token = await loginAs(DEMO_EMAILS.landowner);
    const res = await apiFetch("/grievances", {
      method: "POST",
      token,
      body: { category: "Not A Real Category", description: "This description is definitely long enough." },
    });
    assert.equal(res.status, 400);
  });

  test("case creation missing required fields is rejected (400)", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const res = await apiFetch("/cases", { method: "POST", token, body: { assignedOfficer: "Someone" } });
    assert.equal(res.status, 400);
  });

  test("unknown route returns a clean 404 JSON envelope, not an HTML error page", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const res = await apiFetch("/this-route-does-not-exist", { token });
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, "NOT_FOUND");
  });

  test("report type must be one of the known values (400)", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const res = await apiFetch("/reports?type=not-a-real-report", { token });
    assert.equal(res.status, 400);
  });

  test("health check is reachable without authentication", async () => {
    const res = await apiFetch("/health");
    assert.equal(res.status, 200);
    assert.equal((res.body.data as { status: string }).status, "ok");
  });
});

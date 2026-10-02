import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, DEMO_EMAILS } from "./helpers.js";

describe("Authentication", () => {
  test("valid credentials return a token and user", async () => {
    const res = await apiFetch<{ token: string; user: { role: string } }>("/auth/login", {
      method: "POST",
      body: { email: DEMO_EMAILS.districtOfficer, password: "demo1234" },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data?.token);
    assert.equal(res.body.data?.user.role, "district_officer");
  });

  test("wrong password is rejected with 401", async () => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: { email: DEMO_EMAILS.districtOfficer, password: "wrong-password" },
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  test("unknown email is rejected with 401, not 404 (doesn't leak account existence)", async () => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: { email: "nobody@bhoomisetu.demo", password: "demo1234" },
    });
    assert.equal(res.status, 401);
  });

  test("malformed login body is rejected with a validation error", async () => {
    const res = await apiFetch("/auth/login", { method: "POST", body: { email: "not-an-email" } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, "VALIDATION_ERROR");
  });

  test("protected route without a token returns 401", async () => {
    const res = await apiFetch("/cases");
    assert.equal(res.status, 401);
  });

  test("protected route with a garbage token returns 401", async () => {
    const res = await apiFetch("/cases", { token: "not-a-real-jwt" });
    assert.equal(res.status, 401);
  });

  test("GET /auth/me echoes the authenticated user", async () => {
    const loginRes = await apiFetch<{ token: string }>("/auth/login", {
      method: "POST",
      body: { email: DEMO_EMAILS.superAdmin, password: "demo1234" },
    });
    const token = loginRes.body.data!.token;

    const meRes = await apiFetch<{ email: string }>("/auth/me", { token });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.data?.email, DEMO_EMAILS.superAdmin);
  });
});

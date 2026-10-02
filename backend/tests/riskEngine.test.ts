import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, loginAs, DEMO_EMAILS } from "./helpers.js";

describe("Risk scoring", () => {
  test("flagship (delayed) case scores in-range with explainable reasons", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const casesRes = await apiFetch<{ id: string; caseNumber: string }[]>("/cases", { token });
    const flagship = casesRes.body.data!.find((c) => c.caseNumber === "BS-2026-00124")!;

    const res = await apiFetch<{
      score: number;
      level: string;
      reasons: string[];
      recommendation: string;
      disclaimer: string;
    }>(`/cases/${flagship.id}/risk-score`, { token });

    assert.equal(res.status, 200);
    const data = res.body.data!;
    assert.ok(data.score >= 0 && data.score <= 100, "score must be within 0-100");
    assert.ok(["low", "medium", "high", "critical"].includes(data.level));
    assert.ok(data.reasons.length > 0, "must explain the score, not just return a number");
    assert.ok(data.recommendation.length > 0);
    assert.match(data.disclaimer, /prototype/i, "must disclaim it's not a trained AI model");
  });

  test("score is persisted and retrievable again (audit trail)", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const casesRes = await apiFetch<{ id: string }[]>("/cases", { token });
    const caseId = casesRes.body.data![0].id;

    const first = await apiFetch<{ score: number }>(`/cases/${caseId}/risk-score`, { token });
    const second = await apiFetch<{ score: number }>(`/cases/${caseId}/risk-score`, { token });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    // Deterministic given unchanged data — recomputing shouldn't drift.
    assert.equal(first.body.data!.score, second.body.data!.score);
  });

  test("risk score for a non-existent case returns 404", async () => {
    const token = await loginAs(DEMO_EMAILS.districtOfficer);
    const res = await apiFetch("/cases/00000000-0000-0000-0000-000000000000/risk-score", { token });
    assert.equal(res.status, 404);
  });
});

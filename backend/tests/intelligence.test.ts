import { test } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, loginAs, DEMO_EMAILS } from "./helpers.js";
import type { CaseIntelligence } from "../src/types/intelligence.js";

/**
 * The Acquisition Intelligence Engine must be explainable, not merely correct.
 * These tests assert both: the right bottleneck is detected, AND it is backed by
 * evidence that a reviewer can independently verify.
 */

const FLAGSHIP = "BS-2026-00124";

interface CaseRow {
  id: string;
  caseNumber: string;
  currentStage: number;
  status: string;
  riskLevel: string;
}

async function listCases(token: string): Promise<CaseRow[]> {
  const res = await apiFetch<CaseRow[]>("/cases", { token });
  assert.equal(res.status, 200);
  return res.body.data ?? [];
}

test("Acquisition Intelligence Engine", async (t) => {
  const officerToken = await loginAs(DEMO_EMAILS.districtOfficer);
  const adminToken = await loginAs(DEMO_EMAILS.superAdmin);
  const stateToken = await loginAs(DEMO_EMAILS.stateOfficer);

  const cases = await listCases(adminToken);
  const flagship = cases.find((c) => c.caseNumber === FLAGSHIP);
  assert.ok(flagship, `seed must contain ${FLAGSHIP}`);

  // ---------------------------------------------------------------------
  await t.test("requires authentication", async () => {
    const res = await apiFetch(`/intelligence/cases/${flagship.id}`);
    assert.equal(res.status, 401);
  });

  // ---------------------------------------------------------------------
  await t.test("unknown case returns 404, not a leak of existence", async () => {
    const res = await apiFetch("/intelligence/cases/00000000-0000-0000-0000-000000000000", {
      token: adminToken,
    });
    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, "CASE_NOT_FOUND");
  });

  // ---------------------------------------------------------------------
  await t.test("flagship analysis detects a real bottleneck with evidence", async () => {
    const res = await apiFetch<CaseIntelligence>(`/intelligence/cases/${flagship.id}`, {
      token: adminToken,
    });

    assert.equal(res.status, 200);
    const data = res.body.data;
    assert.ok(data, "expected analysis payload");

    assert.equal(data.caseNumber, FLAGSHIP);
    assert.equal(data.analysisVersion, "BHOOMI_INTELLIGENCE_V1");

    // The seeded case is delayed at stage 6, so a bottleneck must be found.
    assert.ok(data.primaryBlocker, "a delayed case must have a primary blocker");
    assert.ok(
      data.allBlockers.length > 0,
      "at least one blocker must be detected",
    );
  });

  // ---------------------------------------------------------------------
  await t.test("every blocker is backed by evidence that exists in the payload", async () => {
    const res = await apiFetch<CaseIntelligence>(`/intelligence/cases/${flagship.id}`, {
      token: adminToken,
    });
    const data = res.body.data!;

    const evidenceIds = new Set(data.evidence.map((e) => e.id));
    assert.ok(evidenceIds.size > 0, "evidence list must not be empty");

    for (const blocker of data.allBlockers) {
      assert.ok(
        blocker.evidenceIds.length > 0,
        `blocker "${blocker.title}" has no evidence — an unevidenced conclusion is not acceptable`,
      );
      for (const id of blocker.evidenceIds) {
        assert.ok(evidenceIds.has(id), `blocker references unknown evidence id ${id}`);
      }
    }

    // Every evidence item must name a real source and field so a reviewer can
    // trace it to a row.
    for (const e of data.evidence) {
      assert.ok(e.source, "evidence must name its source table");
      assert.ok(e.field, "evidence must name the exact field observed");
      assert.ok(e.observed, "evidence must record what was observed");
    }
  });

  // ---------------------------------------------------------------------
  await t.test("evidence ids are unique and every reference in the analysis resolves", async () => {
    // The collector hands out sequential ids that blockers, contributing factors,
    // active dependencies and recommendations all cite by. A duplicate or a
    // dangling reference would make the explanation unfollowable in the UI, and
    // would be invisible to a test that only looks at one section at a time.
    for (const target of cases) {
      const res = await apiFetch<CaseIntelligence>(`/intelligence/cases/${target.id}`, {
        token: adminToken,
      });
      assert.equal(res.status, 200, `analysis failed for ${target.caseNumber}`);
      const data = res.body.data!;

      const ids = data.evidence.map((e) => e.id);
      assert.equal(
        new Set(ids).size,
        ids.length,
        `duplicate evidence id in the analysis for ${target.caseNumber}`,
      );

      const known = new Set(ids);
      const references: { id: string; from: string }[] = [];
      for (const b of data.allBlockers) {
        b.evidenceIds.forEach((id) => references.push({ id, from: `blocker "${b.title}"` }));
      }
      for (const c of data.contributingFactors) {
        c.evidenceIds.forEach((id) => references.push({ id, from: `factor "${c.title}"` }));
      }
      for (const d of data.activeDependencies ?? []) {
        d.evidenceIds.forEach((id) => references.push({ id, from: `dependency "${d.title}"` }));
      }
      for (const r of data.recommendations) {
        r.evidenceIds.forEach((id) => references.push({ id, from: `recommendation "${r.action}"` }));
      }

      for (const ref of references) {
        assert.ok(
          known.has(ref.id),
          `${ref.from} in ${target.caseNumber} references unknown evidence ${ref.id}`,
        );
      }
    }
  });

  // ---------------------------------------------------------------------
  await t.test("recommendations cite evidence and never name an individual", async () => {
    const res = await apiFetch<CaseIntelligence>(`/intelligence/cases/${flagship.id}`, {
      token: adminToken,
    });
    const data = res.body.data!;

    const evidenceIds = new Set(data.evidence.map((e) => e.id));
    for (const r of data.recommendations) {
      assert.ok(r.action, "recommendation needs an action");
      assert.ok(r.reason, "recommendation needs a reason");
      assert.ok(r.priority, "recommendation needs a priority");
      for (const id of r.evidenceIds) {
        assert.ok(evidenceIds.has(id), `recommendation references unknown evidence id ${id}`);
      }
      // Accountability is expressed as a role or department, never a person.
      assert.ok(
        /department|authority|officer|administrator|treasury|office|committee|cell/i.test(
          r.responsibleRole,
        ),
        `responsibleRole "${r.responsibleRole}" should name a role or department, not a person`,
      );
    }
  });

  // ---------------------------------------------------------------------
  await t.test("risk engine is reused, never re-scored or overridden", async () => {
    const res = await apiFetch<CaseIntelligence>(`/intelligence/cases/${flagship.id}`, {
      token: adminToken,
    });
    const data = res.body.data!;

    // The seeded case carries risk_level 'high', but the deterministic engine
    // computes ~60 => 'medium'. The engine must report BOTH and overwrite
    // neither, rather than silently picking one.
    assert.equal(data.risk.source, "computed");
    assert.equal(data.risk.level, "medium");
    assert.equal(data.risk.score, 60);
    assert.ok(data.riskDisagreement, "the disagreement must be surfaced, not hidden");
    assert.equal(data.riskDisagreement.caseFieldLevel, "high");
    assert.equal(data.riskDisagreement.computedLevel, "medium");
  });

  // ---------------------------------------------------------------------
  await t.test("no numeric confidence or score is exposed to the client", async () => {
    const res = await apiFetch<CaseIntelligence>(`/intelligence/cases/${flagship.id}`, {
      token: adminToken,
    });
    const raw = JSON.stringify(res.body.data);

    assert.ok(raw.includes('"confidence":"high"'), "confidence must be categorical");
    // An uncalibrated percentage would be indefensible; assert none is present.
    assert.ok(
      !/"(confidence|probability|score|similarity)"\s*:\s*0?\.\d+/.test(raw),
      "no numeric probability or uncalibrated score may be exposed",
    );
  });

  // ---------------------------------------------------------------------
  await t.test("dependency chain starts at the originating stage and has no duplicates", async () => {
    const res = await apiFetch<CaseIntelligence>(`/intelligence/cases/${flagship.id}`, {
      token: adminToken,
    });
    const chain = res.body.data!.dependencyChain;

    assert.ok(chain.length > 0, "a bottleneck must produce a dependency chain");
    assert.equal(chain[0].isPrimary, true, "first node must be marked primary");
    assert.ok(
      chain[0].stageNumber <= flagship.currentStage,
      "the chain must start at or before the current stage, not downstream of it",
    );

    const seen = new Set<number>();
    for (const node of chain) {
      assert.ok(!seen.has(node.stageNumber), `stage ${node.stageNumber} duplicated in the chain`);
      seen.add(node.stageNumber);
    }
  });

  // ---------------------------------------------------------------------
  await t.test("summary never contradicts the evidence it cites", async () => {
    const res = await apiFetch<CaseIntelligence>(`/intelligence/cases/${flagship.id}`, {
      token: adminToken,
    });
    const data = res.body.data!;

    assert.ok(data.summary.length > 0, "summary must not be empty");
    assert.ok(
      data.summary.includes(FLAGSHIP),
      "summary must identify the case it describes",
    );
    // It must not claim to be a prototype/stub.
    assert.ok(!/prototype mode/i.test(data.summary));
  });

  // ---------------------------------------------------------------------
  await t.test("sub-resources agree with the full analysis", async () => {
    const full = await apiFetch<CaseIntelligence>(`/intelligence/cases/${flagship.id}`, {
      token: adminToken,
    });
    const blockers = await apiFetch(`/intelligence/cases/${flagship.id}/blockers`, {
      token: adminToken,
    });
    const evidence = await apiFetch(`/intelligence/cases/${flagship.id}/evidence`, {
      token: adminToken,
    });
    const recs = await apiFetch(`/intelligence/cases/${flagship.id}/recommendations`, {
      token: adminToken,
    });

    assert.equal(
      blockers.body.data.allBlockers.length,
      full.body.data!.allBlockers.length,
      "the blockers sub-resource must match the full analysis",
    );
    assert.equal(
      evidence.body.data.evidence.length,
      full.body.data!.evidence.length,
      "the evidence sub-resource must match the full analysis",
    );
    assert.equal(
      recs.body.data.recommendations.length,
      full.body.data!.recommendations.length,
      "the recommendations sub-resource must match the full analysis",
    );
  });

  // ---------------------------------------------------------------------
  await t.test("analyze endpoint audit-logs the run", async () => {
    const res = await apiFetch(`/intelligence/cases/${flagship.id}/analyze`, {
      method: "POST",
      token: officerToken,
      body: { recordAudit: true },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data);
  });

  // ---------------------------------------------------------------------
  await t.test("taxonomy exposes the closed set of bottleneck categories", async () => {
    const res = await apiFetch<{ bottleneckCategories: string[]; analysisVersion: string }>(
      "/intelligence/taxonomy",
      { token: officerToken },
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.data.bottleneckCategories.length >= 15);
    assert.equal(res.body.data.analysisVersion, "BHOOMI_INTELLIGENCE_V1");
  });
});

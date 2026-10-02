import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, loginAs, DEMO_EMAILS } from "./helpers.js";
import { pool } from "../src/config/db.js";
import { PIPELINE_STAGES } from "../src/types/index.js";

/**
 * Intelligence semantics for Rehabilitation & Resettlement.
 *
 * The rule under test: "not finished" is not the same claim as "blocking".
 * An R&R record in `in_progress` is an active dependency unless the evidence
 * shows it is actually holding the case up.
 *
 * These fixtures are created against the dedicated test database and removed
 * afterwards. Each uses a freshly created case so nothing the assertions touch is
 * shared with the seeded dataset or with other test files.
 */

interface Intelligence {
  primaryBlocker: { type: string; title: string; severity: string } | null;
  contributingFactors: { type: string; title: string }[];
  allBlockers: { type: string; title: string; severity: string }[];
  activeDependencies?: {
    category: string;
    classification: string;
    title: string;
    reason: string;
    severity: string;
    blocking: boolean;
    evidenceIds: string[];
  }[];
  evidence: { id: string; source: string; field: string; observed: string; supports: string }[];
  recommendations: { action: string }[];
}

const RR_BLOCKER = "r_and_r_blocker";
const FIXTURE_DISTRICT = "Intelligence Fixture District";

const stageName = (n: number) => PIPELINE_STAGES[n - 1]?.name ?? `Stage ${n}`;

/**
 * Returns a district that no seeded user is scoped to.
 *
 * The suite's files run in parallel against one database, so committed fixtures
 * are visible to the other files. Putting every fixture case in its own district
 * keeps district-scoped assertions elsewhere — which count cases within one
 * specific district — unaffected by this file's rows.
 */
async function fixtureDistrictId(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO districts (name, state_name) VALUES ($1, 'Fixture State')
     ON CONFLICT (name, state_name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [FIXTURE_DISTRICT],
  );
  return rows[0].id;
}

/**
 * Returns a parcel owned by a fixture landowner, creating both on first use.
 *
 * Ownership is the other axis cases are scoped by, so reusing a seeded parcel
 * would hand its owner every fixture case for the duration of this file and
 * perturb landowner-scoped assertions in the files running alongside it.
 */
async function fixtureParcelId(districtId: string): Promise<string> {
  const { rows: ownerRows } = await pool.query<{ id: string }>(
    `INSERT INTO landowners (landowner_ref, name) VALUES ($1, 'Intelligence Fixture Owner')
     ON CONFLICT (landowner_ref) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    ["INT-OWNER"],
  );

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO land_parcels
       (ulpin, district_id, landowner_id, area_hectares, land_use, centroid, boundary)
     VALUES ($1, $2, $3, 1.25, 'agricultural',
             ST_SetSRID(ST_MakePoint(75.9, 26.9), 4326),
             ST_GeomFromText('POLYGON((75.9 26.9, 75.901 26.9, 75.901 26.901, 75.9 26.901, 75.9 26.9))', 4326))
     ON CONFLICT (ulpin) DO UPDATE SET district_id = EXCLUDED.district_id
     RETURNING id`,
    ["INT-ULPIN-0001", districtId, ownerRows[0].id],
  );
  return rows[0].id;
}

/**
 * Creates a case positioned at `currentStage` with an R&R record in `rrStatus`,
 * plus stages 1..10 so the pipeline reads normally.
 */
async function createCase(opts: {
  label: string;
  currentStage: number;
  rrStatus: string;
  targetDate?: string | null;
  rrStageStatus?: string;
}): Promise<string> {
  const { rows: refs } = await pool.query<{ project_id: string }>(
    `SELECT p.id AS project_id FROM acquisition_cases c
     JOIN projects p ON p.id = c.project_id LIMIT 1`,
  );

  const districtId = await fixtureDistrictId();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO acquisition_cases
       (case_number, project_id, parcel_id, district_id, current_stage, status, risk_level, assigned_officer)
     VALUES ($1, $2, $3, $4, $5, 'on_track', 'low', 'Intelligence test fixture')
     RETURNING id`,
    [
      `INT-${opts.label}`,
      refs[0].project_id,
      await fixtureParcelId(districtId),
      districtId,
      opts.currentStage,
    ],
  );
  const caseId = rows[0].id;

  for (let n = 1; n <= 10; n += 1) {
    // Stage 8 is the R&R stage. Everything else follows the case position.
    const status =
      n < opts.currentStage
        ? "completed"
        : n === opts.currentStage
          ? "in_progress"
          : "not_started";
    const rrStatus = n === 8 ? (opts.rrStageStatus ?? "in_progress") : status;
    await pool.query(
      `INSERT INTO acquisition_stages
         (case_id, stage_number, stage_name, status, responsible_department, responsible_officer)
       VALUES ($1, $2, $3, $4, $5, 'Fixture officer')`,
      [caseId, n, stageName(n), rrStatus, "Fixture Department"],
    );
  }

  await pool.query(
    `INSERT INTO rehabilitation (case_id, status, details, target_date)
     VALUES ($1, $2, 'Fixture R&R record', $3)`,
    [caseId, opts.rrStatus, opts.targetDate ?? null],
  );

  return caseId;
}

async function addRAndRTask(
  caseId: string,
  opts: { title: string; status: string; dueDate?: string | null },
): Promise<void> {
  await pool.query(
    `INSERT INTO tasks (task_ref, title, case_id, department, priority, status, due_date)
     VALUES ($1, $2, $3, 'Rehabilitation & Resettlement Department', 'high', $4, $5)`,
    [`INT-TASK-${caseId.slice(0, 8)}`, opts.title, caseId, opts.status, opts.dueDate ?? null],
  );
}

async function analyze(caseId: string): Promise<Intelligence> {
  const token = await loginAs(DEMO_EMAILS.superAdmin);
  const res = await apiFetch<Intelligence>(`/intelligence/cases/${caseId}`, { token });
  assert.equal(res.status, 200, `intelligence request failed for ${caseId}`);
  return res.body.data!;
}

const rrBlockers = (i: Intelligence) => i.allBlockers.filter((b) => b.type === RR_BLOCKER);
const rrDependencies = (i: Intelligence) =>
  (i.activeDependencies ?? []).filter((d) => d.category === RR_BLOCKER);

after(async () => {
  // Fixtures cascade from the case, but the supporting rows are removed
  // explicitly so a failed setup cannot leave them behind for the next run.
  await pool.query("DELETE FROM tasks WHERE task_ref LIKE 'INT-TASK-%'");
  await pool.query("DELETE FROM acquisition_cases WHERE case_number LIKE 'INT-%'").catch(() => undefined);
  await pool
    .query("DELETE FROM land_parcels WHERE ulpin LIKE 'INT-ULPIN-%'")
    .catch(() => undefined);
  await pool
    .query("DELETE FROM landowners WHERE landowner_ref = 'INT-OWNER'")
    .catch(() => undefined);
  await pool
    .query("DELETE FROM districts WHERE name = $1", [FIXTURE_DISTRICT])
    .catch(() => undefined);
  await pool.end();
});

describe("R&R intelligence semantics", () => {
  test("1. in_progress R&R is an active dependency, not a blocker", async () => {
    // Stage 8 exactly, no past target date, no overdue work item: nothing in the
    // evidence says this is stopping the case.
    const caseId = await createCase({
      label: "active",
      currentStage: 8,
      rrStatus: "in_progress",
      rrStageStatus: "in_progress",
    });

    const analysis = await analyze(caseId);

    assert.equal(
      rrBlockers(analysis).length,
      0,
      "an in-progress R&R with no blocking evidence must not be reported as a blocker",
    );
    assert.equal(analysis.primaryBlocker?.type === RR_BLOCKER, false);

    const deps = rrDependencies(analysis);
    assert.equal(deps.length, 1, "expected exactly one R&R active dependency");
    assert.equal(deps[0].classification, "active_dependency");
    assert.equal(deps[0].blocking, false);
    assert.equal(deps[0].severity, "info");
    assert.match(deps[0].title, /in progress/i);
    assert.match(deps[0].reason, /currently in progress/i);
    assert.doesNotMatch(deps[0].reason, /blocking the case/i);

    // Every evidence reference must resolve, so a reviewer can verify the claim.
    const known = new Set(analysis.evidence.map((e) => e.id));
    for (const id of deps[0].evidenceIds) {
      assert.ok(known.has(id), `active dependency cited unknown evidence ${id}`);
    }

    // A non-blocking dependency must not generate a "clear the blockage" action.
    assert.ok(
      !analysis.recommendations.some((r) => /clear the blocking/i.test(r.action)),
      "a non-blocking dependency must not produce a remediation recommendation",
    );
  });

  test("2. completed R&R produces no blocker and no active dependency", async () => {
    const caseId = await createCase({
      label: "complete",
      currentStage: 10,
      rrStatus: "completed",
      rrStageStatus: "completed",
    });

    const analysis = await analyze(caseId);

    assert.equal(rrBlockers(analysis).length, 0);
    assert.equal(rrDependencies(analysis).length, 0);
    assert.equal(
      analysis.evidence.some((e) => e.source === "rehabilitation" && /not complete/i.test(e.supports ?? "")),
      false,
      "completed R&R must not be described as incomplete",
    );
  });

  test("3. in_progress with an overdue R&R work item is a blocker", async () => {
    const caseId = await createCase({
      label: "overdue-task",
      currentStage: 8,
      rrStatus: "in_progress",
      rrStageStatus: "in_progress",
    });
    await addRAndRTask(caseId, { title: "Complete R&R assessment", status: "overdue" });

    const analysis = await analyze(caseId);

    const blockers = rrBlockers(analysis);
    assert.equal(blockers.length, 1, "an overdue R&R work item must make R&R a blocker");
    assert.equal(blockers[0].severity, "high");

    const deps = rrDependencies(analysis);
    assert.equal(deps.length, 1);
    assert.equal(deps[0].classification, "blocker");
    assert.equal(deps[0].blocking, true);
    assert.match(deps[0].reason, /preventing progress/i);

    // The work item must be cited as evidence, not just asserted in prose.
    const cited = deps[0].evidenceIds.map((id) => analysis.evidence.find((e) => e.id === id));
    assert.ok(
      cited.some((e) => e?.source === "task"),
      "the overdue work item must appear as evidence",
    );
  });

  test("3b. an R&R work item past its own due date is a blocker", async () => {
    const caseId = await createCase({
      label: "past-due",
      currentStage: 8,
      rrStatus: "in_progress",
      rrStageStatus: "in_progress",
    });
    // Not flagged overdue, but the action's own due date has passed. The due date
    // is the SLA for the action, so no constant is needed.
    await addRAndRTask(caseId, {
      title: "Issue entitlement certificate",
      status: "in_progress",
      dueDate: "2020-01-01",
    });

    const analysis = await analyze(caseId);
    assert.equal(rrDependencies(analysis)[0]?.blocking, true);
    assert.equal(rrBlockers(analysis).length, 1);
  });

  test("3c. a completed R&R work item is not treated as overdue", async () => {
    const caseId = await createCase({
      label: "done-task",
      currentStage: 8,
      rrStatus: "in_progress",
      rrStageStatus: "in_progress",
    });
    await addRAndRTask(caseId, {
      title: "Site allocation completed long ago",
      status: "completed",
      dueDate: "2020-01-01",
    });

    const analysis = await analyze(caseId);
    assert.equal(rrBlockers(analysis).length, 0, "finished work must not create a blocker");
    assert.equal(rrDependencies(analysis)[0]?.blocking, false);
  });

  test("4. in_progress past the R&R stage, with stage 8 incomplete, is a blocker", async () => {
    // The case advanced to stage 9 while R&R is still open, so a downstream stage
    // is sitting on an undischarged obligation.
    const caseId = await createCase({
      label: "downstream",
      currentStage: 9,
      rrStatus: "in_progress",
      rrStageStatus: "in_progress",
    });

    const analysis = await analyze(caseId);

    assert.equal(rrBlockers(analysis).length, 1);
    const deps = rrDependencies(analysis);
    assert.equal(deps[0].classification, "blocker");
    assert.equal(deps[0].blocking, true);
    assert.match(deps[0].reason, /downstream stage depends/i);
  });

  test("5. a disputed R&R record keeps the existing blocker semantics", async () => {
    const caseId = await createCase({
      label: "disputed",
      currentStage: 8,
      rrStatus: "disputed",
      rrStageStatus: "in_progress",
    });

    const analysis = await analyze(caseId);

    assert.equal(rrBlockers(analysis).length, 1, "a disputed R&R record remains a blocker");
    assert.equal(rrDependencies(analysis)[0]?.classification, "blocker");
    assert.equal(rrDependencies(analysis)[0]?.blocking, true);
  });

  test("5b. a past R&R target date alone is enough to block", async () => {
    const caseId = await createCase({
      label: "past-target",
      currentStage: 8,
      rrStatus: "in_progress",
      rrStageStatus: "in_progress",
      targetDate: "2020-06-01",
    });

    const analysis = await analyze(caseId);
    assert.equal(rrBlockers(analysis).length, 1);
    assert.match(rrDependencies(analysis)[0].reason, /target date/i);
  });

  test("5c. a stored risk reason naming R&R is a blocker", async () => {
    // Otherwise an unremarkable stage-8 case: no past target date, no overdue
    // work item, no downstream stage. The only thing making R&R blocking is the
    // risk record, which is the one evidence source outside the R&R tables.
    const caseId = await createCase({
      label: "risk-named",
      currentStage: 8,
      rrStatus: "in_progress",
      rrStageStatus: "in_progress",
    });
    await pool.query(
      `INSERT INTO risk_scores (case_id, score, level, reasons, recommendation)
       VALUES ($1, 70, 'high', $2::jsonb, 'R&R is the binding constraint on this case.')`,
      [caseId, JSON.stringify(["Resettlement offer not accepted by the family"])],
    );

    const analysis = await analyze(caseId);

    assert.equal(
      rrBlockers(analysis).length,
      1,
      "a risk reason naming resettlement must make R&R a blocker",
    );
    const dep = rrDependencies(analysis)[0];
    assert.equal(dep.blocking, true);
    assert.equal(dep.classification, "blocker");

    // The claim must be traceable to the risk record rather than asserted.
    const cited = dep.evidenceIds.map((id) => analysis.evidence.find((e) => e.id === id));
    assert.ok(
      cited.some((e) => e?.source === "risk_score"),
      "the risk reason must appear as evidence",
    );
    assert.ok(
      cited.some((e) => /resettlement/i.test(e?.observed ?? "")),
      "the cited evidence must quote the reason that triggered the rule",
    );
  });

  test("5d. a risk reason that does not name R&R leaves it a non-blocking dependency", async () => {
    // The counterpart to 5c: the rule must key on R&R being named, not on the
    // case merely having a high risk score.
    const caseId = await createCase({
      label: "risk-other",
      currentStage: 8,
      rrStatus: "in_progress",
      rrStageStatus: "in_progress",
    });
    await pool.query(
      `INSERT INTO risk_scores (case_id, score, level, reasons, recommendation)
       VALUES ($1, 80, 'high', $2::jsonb, 'Compensation valuation dispute.')`,
      [caseId, JSON.stringify(["Compensation valuation under dispute", "Grievance unacknowledged"])],
    );

    const analysis = await analyze(caseId);

    assert.equal(
      rrBlockers(analysis).length,
      0,
      "an unrelated high risk score must not turn R&R into a blocker",
    );
    assert.equal(rrDependencies(analysis)[0]?.blocking, false);
  });

  test("a non-blocking dependency never influences the primary blocker ranking", async () => {
    const activeId = await createCase({
      label: "rank-active",
      currentStage: 8,
      rrStatus: "in_progress",
      rrStageStatus: "in_progress",
    });
    const active = await analyze(activeId);
    // Nothing else is wrong with this fixture, so there should be no primary
    // blocker at all — proving R&R in progress did not manufacture one.
    assert.equal(active.primaryBlocker, null);
    assert.equal(active.allBlockers.length, 0);
  });
});
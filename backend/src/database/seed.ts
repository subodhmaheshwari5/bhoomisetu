// -----------------------------------------------------------------------
// SEED SCRIPT — BhoomiSetu prototype
//
// Populates the database with the same fictional demo dataset the
// frontend ships with (src/data/demoData.ts, caseData.ts, authData.ts on
// the frontend), so the two stay recognizably in sync even though this
// version is generated independently against real tables. Safe to re-run:
// it truncates the domain tables first.
// -----------------------------------------------------------------------

import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "../config/db.js";
import { PIPELINE_STAGES, DOCUMENT_CATEGORIES } from "../types/index.js";
import type { CaseStatus, RiskLevel, StageStatus, UserRole } from "../types/index.js";

const DISTRICTS = [
  { key: "d-jaipur", name: "Jaipur", stateName: "Rajasthan", lat: 26.9124, lng: 75.7873 },
  { key: "d-jodhpur", name: "Jodhpur", stateName: "Rajasthan", lat: 26.2389, lng: 73.0243 },
  { key: "d-kota", name: "Kota", stateName: "Rajasthan", lat: 25.2138, lng: 75.8648 },
  { key: "d-ajmer", name: "Ajmer", stateName: "Rajasthan", lat: 26.4499, lng: 74.6399 },
  { key: "d-udaipur", name: "Udaipur", stateName: "Rajasthan", lat: 24.5854, lng: 73.7125 },
];

const PROJECTS = [
  { key: "p-01", name: "Jaipur Ring Road", agency: "NHAI", districtKey: "d-jaipur" },
  { key: "p-02", name: "Jaipur Metro Phase II", agency: "Jaipur Metro Rail Corp.", districtKey: "d-jaipur" },
  { key: "p-03", name: "Jodhpur Industrial Corridor", agency: "RIICO", districtKey: "d-jodhpur" },
  { key: "p-04", name: "Jodhpur\u2013Pali Rail Link", agency: "Indian Railways", districtKey: "d-jodhpur" },
  { key: "p-05", name: "Kota Thermal Expansion", agency: "Rajasthan Rajya Vidyut Utpadan Nigam", districtKey: "d-kota" },
  { key: "p-06", name: "Kota Barrage Canal Widening", agency: "Water Resources Dept.", districtKey: "d-kota" },
  { key: "p-07", name: "Ajmer Smart City Transit Hub", agency: "Ajmer Smart City Ltd.", districtKey: "d-ajmer" },
  { key: "p-08", name: "Ajmer\u2013Beawar Highway Expansion", agency: "NHAI", districtKey: "d-ajmer" },
  { key: "p-09", name: "Udaipur Airport Approach Road", agency: "PWD Rajasthan", districtKey: "d-udaipur" },
  { key: "p-10", name: "Udaipur Lakeside Sewerage Project", agency: "Urban Development Dept.", districtKey: "d-udaipur" },
];

const LAND_USES = ["Agricultural", "Barren", "Residential", "Mixed Use", "Forest Buffer"];

const DEMO_USERS: { name: string; email: string; role: UserRole; districtKey?: string }[] = [
  { name: "System Administrator", email: "admin@bhoomisetu.demo", role: "super_admin" },
  { name: "Anjali Verma", email: "dolr.officer@bhoomisetu.demo", role: "dolr_officer" },
  { name: "Vikram Singh", email: "state.officer@bhoomisetu.demo", role: "state_officer" },
  { name: "Raj Kumar", email: "district.officer@bhoomisetu.demo", role: "district_officer", districtKey: "d-jaipur" },
  { name: "Demo Landowner", email: "landowner@bhoomisetu.demo", role: "landowner" },
  { name: "NHAI Project Office", email: "agency@bhoomisetu.demo", role: "land_agency" },
];

const CASE_STATUSES: CaseStatus[] = ["on_track", "in_progress", "at_risk", "delayed", "completed", "on_hold"];
const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high", "critical"];
const OFFICERS = ["Raj Kumar", "Anita Sharma", "Vikram Singh", "Meera Joshi", "Suresh Patel", "Kavita Rathore"];

const STAGE_DEPARTMENTS = [
  "Revenue & Survey Department",
  "District Land Records Office",
  "Land Acquisition Cell",
  "District Collector Office",
  "Public Relations & Notification Cell",
  "Compensation Assessment Committee",
  "District Treasury",
  "Rehabilitation & Resettlement Department",
  "District Collector Office",
  "Monitoring & Analytics Cell",
];

const GRIEVANCE_CATEGORIES = [
  "Compensation",
  "Ownership",
  "Survey",
  "Documentation",
  "Rehabilitation",
  "Consent/Dispute",
  "Other",
];

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function ulpinFor(index: number): string {
  const body = String(100000000000 + index * 7919).slice(0, 12);
  return `RJ-08-${body}`;
}

function stageStatusRemark(status: StageStatus, stageName: string): string {
  switch (status) {
    case "completed":
      return `${stageName} completed and recorded.`;
    case "in_progress":
      return `${stageName} currently in progress.`;
    case "delayed":
      return `${stageName} has exceeded its scheduled deadline.`;
    case "blocked":
      return `${stageName} is blocked pending resolution.`;
    default:
      return "Not yet started.";
  }
}

/**
 * Truncates and re-seeds every domain table.
 *
 * Exported so `prepareTest.ts` can build a deterministic test fixture. The pool
 * is left open for the caller to close; the CLI entry point below does that
 * itself.
 */
export async function seed() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("Truncating existing demo data...");
    await client.query(`
      TRUNCATE TABLE
        intelligence_audit_logs, case_resolutions, risk_scores, audit_logs,
        notifications, grievances, rehabilitation,
        compensation, documents, acquisition_stages, acquisition_cases,
        land_parcels, landowners, users, projects, districts, states
      RESTART IDENTITY CASCADE
    `);

    // --- States ------------------------------------------------------
    // schema_ext.sql derives states from districts and backfills districts'
    // state_id, but that migration runs before this seed. Creating districts
    // with no state link would leave the admin state list empty and every
    // district unattributed, so states are seeded here and linked directly.
    const stateIds = new Map<string, string>();
    for (const stateName of [...new Set(DISTRICTS.map((d) => d.stateName))]) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO states (name, code, region, status) VALUES ($1, $2, $3, 'active')
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [stateName, stateName.slice(0, 3).toUpperCase(), "Rajasthan"],
      );
      stateIds.set(stateName, rows[0].id);
    }
    console.log(`Seeded ${stateIds.size} states.`);

    // --- Districts ---------------------------------------------------
    const districtIds = new Map<string, string>();
    for (const d of DISTRICTS) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO districts (name, state_name, state_id) VALUES ($1, $2, $3) RETURNING id`,
        [d.name, d.stateName, stateIds.get(d.stateName)],
      );
      districtIds.set(d.key, rows[0].id);
    }
    console.log(`Seeded ${DISTRICTS.length} districts.`);

    // --- Projects ----------------------------------------------------
    const projectIds = new Map<string, string>();
    for (const p of PROJECTS) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO projects (name, agency, district_id) VALUES ($1, $2, $3) RETURNING id`,
        [p.name, p.agency, districtIds.get(p.districtKey)],
      );
      projectIds.set(p.key, rows[0].id);
    }
    console.log(`Seeded ${PROJECTS.length} projects.`);

    // --- Demo user accounts -------------------------------------------
    const passwordHash = await bcrypt.hash("demo1234", 10);
    let demoLandownerUserId: string | null = null;
    for (const u of DEMO_USERS) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO users (name, email, password_hash, role, district_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [u.name, u.email, passwordHash, u.role, u.districtKey ? districtIds.get(u.districtKey) : null],
      );
      if (u.role === "landowner") demoLandownerUserId = rows[0].id;
    }
    console.log(`Seeded ${DEMO_USERS.length} demo user accounts (password: demo1234).`);

    // --- Landowners + parcels (with PostGIS geometry) -----------------
    const parcelIds: string[] = [];
    const parcelDistrictKeys: string[] = [];
    const PARCEL_COUNT = 20;
    // The seeded landowner@bhoomisetu.demo account "owns" these parcels, so
    // the landowner portal's My Land / My Cases has real, non-empty content
    // — including the flagship case's parcel (index 0). Both indexes point
    // to ONE landowner record (a person can own multiple parcels), not two.
    const DEMO_LANDOWNER_PARCEL_INDEXES = [0, 5];
    let demoLandownerRecordId: string | null = null;

    for (let i = 0; i < PARCEL_COUNT; i++) {
      const project = PROJECTS[i % PROJECTS.length];
      const district = DISTRICTS.find((d) => d.key === project.districtKey)!;

      let ownerId: string;
      if (DEMO_LANDOWNER_PARCEL_INDEXES.includes(i) && demoLandownerRecordId) {
        // Reuse the same landowner record created for the first demo parcel.
        ownerId = demoLandownerRecordId;
      } else {
        const linkToDemoUser = i === DEMO_LANDOWNER_PARCEL_INDEXES[0] ? demoLandownerUserId : null;
        const { rows: ownerRows } = await client.query<{ id: string }>(
          `INSERT INTO landowners (landowner_ref, name, user_id) VALUES ($1, $2, $3) RETURNING id`,
          [`LO-${String(i + 1).padStart(4, "0")}`, `Demo Landowner ${i + 1}`, linkToDemoUser],
        );
        ownerId = ownerRows[0].id;
        if (i === DEMO_LANDOWNER_PARCEL_INDEXES[0]) demoLandownerRecordId = ownerId;
      }

      const angle = ((i * 47) % 360) * (Math.PI / 180);
      const radius = 0.02 + ((i * 13) % 40) / 1000;
      const lat = Number((district.lat + radius * Math.cos(angle)).toFixed(5));
      const lng = Number((district.lng + radius * Math.sin(angle)).toFixed(5));
      const half = 0.006;
      const ring = [
        [lng - half, lat - half],
        [lng + half, lat - half],
        [lng + half, lat + half],
        [lng - half, lat + half],
        [lng - half, lat - half],
      ];
      const polygonWkt = `POLYGON((${ring.map(([x, y]) => `${x} ${y}`).join(", ")}))`;

      const { rows: parcelRows } = await client.query<{ id: string }>(
        `INSERT INTO land_parcels
           (ulpin, district_id, landowner_id, area_hectares, land_use, centroid, boundary)
         VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326), ST_SetSRID(ST_GeomFromText($8), 4326))
         RETURNING id`,
        [
          ulpinFor(i + 1),
          districtIds.get(district.key),
          ownerId,
          Number((1 + ((i * 37) % 90) / 10).toFixed(1)),
          LAND_USES[i % LAND_USES.length],
          lng,
          lat,
          polygonWkt,
        ],
      );
      parcelIds.push(parcelRows[0].id);
      parcelDistrictKeys.push(district.key);
    }
    console.log(`Seeded ${PARCEL_COUNT} landowners + land parcels.`);

    // --- Acquisition cases (+ the flagship demo case) -----------------
    type SeedCase = {
      caseNumber: string;
      projectKey: string;
      parcelIndex: number;
      currentStage: number;
      status: CaseStatus;
      riskLevel: RiskLevel;
      assignedOfficer: string;
      createdAt: string;
      isFlagship: boolean;
    };

    const seedCases: SeedCase[] = [];
    for (let i = 0; i < 15; i++) {
      seedCases.push({
        caseNumber: `BS-2026-${String(i + 100).padStart(5, "0")}`,
        projectKey: PROJECTS[i % PROJECTS.length].key,
        parcelIndex: i % PARCEL_COUNT,
        currentStage: 1 + (i % 10),
        status: CASE_STATUSES[i % CASE_STATUSES.length],
        riskLevel: RISK_LEVELS[i % RISK_LEVELS.length],
        assignedOfficer: OFFICERS[i % OFFICERS.length],
        createdAt: `2026-0${1 + (i % 6)}-${String(4 + i).padStart(2, "0")}`,
        isFlagship: false,
      });
    }
    seedCases.unshift({
      caseNumber: "BS-2026-00124",
      projectKey: "p-01",
      parcelIndex: 0,
      currentStage: 6,
      status: "delayed",
      riskLevel: "high",
      assignedOfficer: "Raj Kumar",
      createdAt: "2026-08-12",
      isFlagship: true,
    });

    let stageCount = 0;
    let documentCount = 0;

    for (const c of seedCases) {
      const districtKey = parcelDistrictKeys[c.parcelIndex];
      const { rows: caseRows } = await client.query<{ id: string }>(
        `INSERT INTO acquisition_cases
           (case_number, project_id, parcel_id, district_id, current_stage, status, risk_level, assigned_officer, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
         RETURNING id`,
        [
          c.caseNumber,
          projectIds.get(c.projectKey),
          parcelIds[c.parcelIndex],
          districtIds.get(districtKey),
          c.currentStage,
          c.status,
          c.riskLevel,
          c.assignedOfficer,
          c.createdAt,
        ],
      );
      const caseId = caseRows[0].id;
      const isComplete = c.status === "completed";

      // --- 10-stage pipeline for this case ---
      const stages: {
        stageNumber: number;
        stageName: string;
        status: StageStatus;
        startDate: string | null;
        completionDate: string | null;
        dueDate: string | null;
        remarks: string | null;
        delayDays: number | null;
      }[] = [];

      PIPELINE_STAGES.forEach((stageName, index) => {
        const stageNumber = index + 1;
        const startDate = addDays(c.createdAt, stageNumber === 1 ? 0 : (stageNumber - 1) * 9);

        let status: StageStatus;
        if (isComplete || stageNumber < c.currentStage) {
          status = "completed";
        } else if (stageNumber > c.currentStage) {
          status = "not_started";
        } else {
          status = c.status === "delayed" ? "delayed" : "in_progress";
        }

        const completionDate = status === "completed" ? addDays(startDate, 7) : null;
        const dueDate = status === "not_started" ? null : addDays(startDate, 10);
        const delayDays =
          status === "delayed" ? (c.isFlagship ? 18 : 4 + ((stageNumber * 3) % 11)) : null;

        stages.push({
          stageNumber,
          stageName,
          status,
          startDate: status === "not_started" ? null : startDate,
          completionDate,
          dueDate,
          remarks: status === "not_started" ? null : stageStatusRemark(status, stageName),
          delayDays,
        });
      });

      for (const stage of stages) {
        await client.query(
          `INSERT INTO acquisition_stages
             (case_id, stage_number, stage_name, status, start_date, completion_date, due_date,
              responsible_department, responsible_officer, remarks, delay_days)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            caseId,
            stage.stageNumber,
            stage.stageName,
            stage.status,
            stage.startDate,
            stage.completionDate,
            stage.dueDate,
            STAGE_DEPARTMENTS[stage.stageNumber - 1],
            c.assignedOfficer,
            stage.remarks,
            stage.delayDays,
          ],
        );
        stageCount++;
      }

      // --- Documents (categories 1-9 map to stages 1-9) ---
      for (let index = 0; index < DOCUMENT_CATEGORIES.length; index++) {
        const category = DOCUMENT_CATEGORIES[index];
        const stage = stages[index];
        const docStatus =
          stage.status === "completed"
            ? "verified"
            : stage.status === "in_progress" || stage.status === "delayed"
              ? "pending_verification"
              : null;
        if (!docStatus) continue;

        const fileName = `${category.replace(/[^a-zA-Z0-9]+/g, "_")}_${c.caseNumber}.pdf`;
        const uploadedAt = stage.completionDate ?? stage.startDate ?? c.createdAt;

        await client.query(
          `INSERT INTO documents (case_id, document_type, file_name, storage_path, uploaded_by, verification_status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [caseId, category, fileName, `demo-storage/${caseId}/${fileName}`, c.assignedOfficer, docStatus, uploadedAt],
        );
        documentCount++;
      }

      // Give completed/delayed/at_risk cases at compensation stage or beyond a compensation row.
      if (c.currentStage >= 6 || isComplete) {
        const approvalStatus = isComplete || c.currentStage > 6 ? "approved" : c.status === "delayed" ? "pending" : "under_review";
        const disbursementStatus = isComplete || c.currentStage > 7 ? "disbursed" : "pending";
        await client.query(
          `INSERT INTO compensation (case_id, assessment_amount, approval_status, disbursement_status, payment_date, payment_reference)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            caseId,
            (Number(c.parcelIndex) + 5) * 275000,
            approvalStatus,
            disbursementStatus,
            disbursementStatus === "disbursed" ? addDays(c.createdAt, 80) : null,
            disbursementStatus === "disbursed" ? `COMP-2026-${String(c.parcelIndex).padStart(5, "0")}` : null,
          ],
        );
      }

      // Rehabilitation row for cases at/after stage 8.
      if (c.currentStage >= 8 || isComplete) {
        await client.query(
          `INSERT INTO rehabilitation (case_id, status, details) VALUES ($1, $2, $3)`,
          [caseId, isComplete ? "completed" : "in_progress", "Resettlement package under the project's R&R policy."],
        );
      }
    }

    // Await any still-pending document inserts fired above.
    console.log(`Seeded ${seedCases.length} acquisition cases, ${stageCount} stage records, ${documentCount} documents.`);

    // --- Grievances (>= 15) --------------------------------------------
    const { rows: allCases } = await client.query<{ id: string; case_number: string }>(
      `SELECT id, case_number FROM acquisition_cases`,
    );
    const { rows: allLandowners } = await client.query<{ id: string }>(`SELECT id FROM landowners`);
    const GRIEVANCE_COUNT = 15;
    for (let i = 0; i < GRIEVANCE_COUNT; i++) {
      const relatedCase = allCases[i % allCases.length];
      const landowner = allLandowners[i % allLandowners.length];
      const status = ["submitted", "under_review", "assigned", "resolved", "rejected"][i % 5];
      await client.query(
        `INSERT INTO grievances (grievance_number, case_id, landowner_id, category, description, status, assigned_officer)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          `GRV-2026-${String(i + 1).padStart(4, "0")}`,
          relatedCase.id,
          landowner.id,
          GRIEVANCE_CATEGORIES[i % GRIEVANCE_CATEGORIES.length],
          `Demo grievance regarding case ${relatedCase.case_number}.`,
          status,
          status === "submitted" ? null : OFFICERS[i % OFFICERS.length],
        ],
      );
    }
    console.log(`Seeded ${GRIEVANCE_COUNT} grievances.`);

    // --- Notifications (>= 20) ------------------------------------------
    const { rows: allUsers } = await client.query<{ id: string }>(`SELECT id FROM users`);
    const NOTIFICATION_COUNT = 20;
    for (let i = 0; i < NOTIFICATION_COUNT; i++) {
      const relatedCase = allCases[i % allCases.length];
      const user = allUsers[i % allUsers.length];
      const type = ["deadline_approaching", "deadline_exceeded", "document_missing", "high_risk_case", "grievance_update", "compensation_update"][i % 6];
      await client.query(
        `INSERT INTO notifications (user_id, case_id, type, title, message, is_read)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          user.id,
          relatedCase.id,
          type,
          `${relatedCase.case_number}: ${type.replace(/_/g, " ")}`,
          `Automated notification for case ${relatedCase.case_number} (${type.replace(/_/g, " ")}).`,
          i % 3 === 0,
        ],
      );
    }
    console.log(`Seeded ${NOTIFICATION_COUNT} notifications.`);

    // --- A handful of audit log entries for realism ---------------------
    const auditActions = [
      { action: "STAGE_UPDATED", entity: "acquisition_stage" },
      { action: "DOCUMENT_VERIFIED", entity: "document" },
      { action: "COMPENSATION_APPROVED", entity: "compensation" },
      { action: "GRIEVANCE_ASSIGNED", entity: "grievance" },
      { action: "CASE_STATUS_CHANGED", entity: "acquisition_case" },
    ];
    for (let i = 0; i < auditActions.length; i++) {
      const relatedCase = allCases[i % allCases.length];
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, previous_value, new_value)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          allUsers[i % allUsers.length].id,
          auditActions[i].action,
          auditActions[i].entity,
          relatedCase.id,
          JSON.stringify({ note: "demo previous value" }),
          JSON.stringify({ note: "demo new value" }),
        ],
      );
    }
    console.log(`Seeded ${auditActions.length} audit log entries.`);

    // --- Verified precedents (institutional memory) --------------------
    // Seeded directly as 'verified' so the "similar verified cases" panel has
    // something real to retrieve in a demo. These are the ONLY records allowed
    // to appear as institutional knowledge, and they are fictional demo data.
    // Verified precedents need role separation: the recorder and the verifier
    // must be different officers, which is what makes a precedent trustworthy.
    const { rows: precedentUsers } = await client.query<{ id: string; role: string }>(
      `SELECT id, role FROM users WHERE role IN ('super_admin', 'state_officer', 'district_officer')`,
    );
    const superAdmin =
      precedentUsers.find((u) => u.role === "super_admin") ?? precedentUsers[0];
    const districtOfficer =
      precedentUsers.find((u) => u.role === "district_officer") ?? allUsers[0];
    const stateOfficer =
      precedentUsers.find((u) => u.role === "state_officer") ?? allUsers[0];

    const demoPrecedents = [
      {
        // Deliberately a DIFFERENT case from the flagship so it is retrievable
        // as a precedent for it, not self-referential.
        caseIndex: 1,
        problemType: "approval_blocker",
        stageNumber: 6,
        problemDescription:
          "Compensation approval remained pending after assessment because the valuation supporting document was still awaiting verification.",
        rootCause: "The valuation certificate was uploaded after the assessment was submitted, so the approval packet was incomplete.",
        actionTaken:
          "Verified the valuation certificate, then reopened the approval workflow with a note referencing the verified document.",
        responsibleDepartment: "District Collector Office",
        resolution:
          "Approval was disposed of three days after the valuation certificate was verified.",
        outcome: "Compensation approved and the case advanced to disbursement.",
        recordedBy: districtOfficer.id,
        verifiedBy: stateOfficer.id,
      },
      {
        caseIndex: 2,
        problemType: "document_blocker",
        stageNumber: 6,
        problemDescription:
          "Stage could not complete because a pending-verification document was never actioned, leaving the assessment unsupported.",
        rootCause: "No one was assigned to clear the pending verification queue for the stage.",
        actionTaken:
          "Assigned document verification to the case officer and cleared the queue within the same working day.",
        responsibleDepartment: "District Land Records Office",
        resolution: "All pending documents were verified and the stage closed.",
        outcome: "Stage completed; no downstream delay was recorded.",
        recordedBy: districtOfficer.id,
        verifiedBy: superAdmin.id,
      },
      {
        caseIndex: 3,
        problemType: "grievance_blocker",
        stageNumber: 5,
        problemDescription:
          "A compensation grievance remained unresolved after public notification, holding up the transition to assessment.",
        rootCause: "The grievance was not routed to the redressal authority within the standard timeframe.",
        actionTaken: "Routed the grievance to the district redressal authority and recorded a hearing date.",
        responsibleDepartment: "Grievance Redressal Authority",
        resolution: "Grievance was resolved and the case proceeded.",
        outcome: "Case advanced; the precedent was reused on a later case.",
        recordedBy: districtOfficer.id,
        verifiedBy: stateOfficer.id,
      },
    ];

    for (const p of demoPrecedents) {
      const relatedCase = allCases[p.caseIndex % allCases.length];
      // Enforce the same rule the service does: never let one person record
      // and verify the same resolution, even in demo data.
      const recorder = p.recordedBy;
      const verifier = p.verifiedBy === recorder ? stateOfficer : p.verifiedBy;
      await client.query(
        `INSERT INTO case_resolutions
           (case_id, problem_type, stage_number, problem_description, root_cause,
            action_taken, responsible_department, resolution, outcome,
            resolution_date, status, recorded_by, verified_by, verified_at,
            analysis_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CURRENT_DATE - 30, 'verified', $10, $11, now(), 'BHOOMI_INTELLIGENCE_V1')`,
        [
          relatedCase.id,
          p.problemType,
          p.stageNumber,
          p.problemDescription,
          p.rootCause,
          p.actionTaken,
          p.responsibleDepartment,
          p.resolution,
          p.outcome,
          recorder,
          verifier,
        ],
      );
    }
    console.log(
      `Seeded ${demoPrecedents.length} verified precedents (institutional memory).`,
    );

    await client.query("COMMIT");
    console.log("\nSeed complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** True when this module is the process entry point, not an import. */
const isEntryPoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isEntryPoint) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}

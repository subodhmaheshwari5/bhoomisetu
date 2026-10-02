// -----------------------------------------------------------------------
// DEMO DATASET SEED — BhoomiSetu
//
// Run with:  npm run seed:demo
//
// DESIGN RULES (from the specification):
//
//  1. DETERMINISTIC. No Math.random(), no Date.now(). All variation comes from
//     a seeded PRNG (mulberry32) with a fixed seed, so two runs on two machines
//     produce byte-identical datasets. Rerunning is therefore meaningful: you
//     can compare before/after screenshots.
//
//  2. STABLE IDs. Every primary key is derived from a human-readable label via
//     md5, not gen_random_uuid(). The id for "case BS-2026-00124" is always the
//     same UUID on every machine and every run. That is what makes seeded rows
//     referenceable from docs, tests and demo scripts.
//
//  3. IDEMPOTENT. The run truncates the domain tables first, so it can be rerun
//     any number of times without duplicating anything.
//
//  4. REFERENTIALLY CONSISTENT. Records are inserted in foreign-key order and
//     every link uses a real id: a grievance's case_id is a case that exists, a
//     task's assigned_to is a seeded user, a notification's project_id is the
//     project that actually owns the case. Nothing is randomly cross-wired.
//
//  5. VALID GIS GEOMETRY. Parcels get real PostGIS polygons, spread around each
//     district's true coordinates, non-overlapping per parcel index.
//
//  6. DEMO DATA IS LABELLED FICTIONAL. All projects, people and places below are
//     invented for demonstration. They are not government records.
//
// This is a LARGE dataset, separate from the minimal `npm run db:seed` used by
// the test suite (which needs to be fast, not comprehensive).
// -----------------------------------------------------------------------

import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { pool } from "../config/db.js";
import { PIPELINE_STAGES, DOCUMENT_CATEGORIES } from "../types/index.js";

// =====================================================================
// Determinism helpers
// =====================================================================

const PRNG_SEED = 0x5eed_1234;

/** mulberry32 — small, fast, fully deterministic PRNG. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(PRNG_SEED);

/** Integer in [min, max]. */
function randInt(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/**
 * Deterministic UUID from a stable label.
 *
 * Same label -> same UUID, on every machine and every run. This is what makes
 * seeded rows addressable from tests and demo scripts.
 */
function detUuid(label: string): string {
  const h = createHash("md5").update(`bhoomisetu:v1:${label}`).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `4${h.slice(13, 16)}`,
    `${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}`,
    h.slice(20, 32),
  ].join("-");
}

/**
 * Date anchor: the day the seed runs (UTC).
 *
 * Dates are expressed as offsets from this anchor rather than from a hardcoded
 * calendar date. That keeps the demo meaningful whenever it is seeded — a case
 * that is "18 days overdue" really is 18 days overdue, instead of being 716
 * days overdue because a fixed anchor fell into the past.
 *
 * Consequence for reproducibility: ids, statuses, amounts, counts and the
 * *spacing* between dates are fully deterministic. Absolute dates shift by the
 * same amount if you re-seed on a later day. Hashing the dataset on two runs of
 * the same day yields identical results.
 */
const EPOCH = (() => {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)}`;
})();

/** Deterministic date string N days before the anchor date. */
function dayOffset(days: number): string {
  // Millisecond arithmetic, not setUTCDate.
  //
  // `d.setUTCDate(d.getUTCDate() + days)` is off by one for negative offsets:
  // when getUTCDate() is 1, setUTCDate(-17) lands 17 days before the 1st, not
  // 18, because day 0 already means "the last day of the previous month".
  // That silently shifted every seeded date by a day and made the flagship's
  // computed delay (19) contradict its recorded delay (18).
  const ms = Date.parse(`${EPOCH}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// =====================================================================
// Bulk insert helper
//
// Table and column names are compile-time constants defined in this file, never
// user input. Only the VALUES are parameterized. Columns may carry an SQL
// expression (used for PostGIS geometry) which itself may contain placeholders.
// =====================================================================

interface ColumnSpec {
  name: string;
  expr?: string;
}

async function bulkInsert(
  client: PoolClient,
  table: string,
  columns: ColumnSpec[],
  rows: unknown[][],
): Promise<void> {
  if (rows.length === 0) return;

  // Fail loudly on a width mismatch. Without this, an extra or missing value
  // per row is silently dropped or shifted one column along — which produces a
  // date string in a text column and hides the mistake until someone reads it.
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== columns.length) {
      throw new Error(
        `bulkInsert("${table}"): row ${i} has ${rows[i].length} value(s) but the column list has ` +
          `${columns.length}. Data would be shifted or dropped.`,
      );
    }
  }

  const colList = columns.map((c) => c.name).join(", ");
  const CHUNK = 400;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const tuples: string[] = [];
    const params: unknown[] = [];

    for (const row of chunk) {
      const parts: string[] = [];
      for (let c = 0; c < columns.length; c++) {
        // node-postgres uses numbered placeholders ($1, $2, ...), not `?`.
        // Rewrite each `?` in this column's expression to the next index so
        // geometry expressions like ST_GeomFromText(?, 4326) bind correctly.
        const spec = columns[c];
        let expr = spec?.expr ?? "?";
        expr = expr.replace(/\?/g, () => `$${params.length + 1}`);
        parts.push(expr);
        params.push(row[c]);
      }
      tuples.push(`(${parts.join(", ")})`);
    }

    await client.query(`INSERT INTO ${table} (${colList}) VALUES ${tuples.join(", ")}`, params);
  }
}

// =====================================================================
// Reference data (all fictional, demonstration only)
// =====================================================================

const STATES = [
  { key: "s-rj", name: "Rajasthan", code: "RJ", region: "North West" },
  { key: "s-gj", name: "Gujarat", code: "GJ", region: "West" },
  { key: "s-mp", name: "Madhya Pradesh", code: "MP", region: "Central" },
  { key: "s-up", name: "Uttar Pradesh", code: "UP", region: "North" },
  { key: "s-mh", name: "Maharashtra", code: "MH", region: "West" },
] as const;

// The ten Rajasthan districts named in the specification are the primary demo
// region; the rest exist to prove multi-state administration works.
const DISTRICTS = [
  { key: "d-jaipur", name: "Jaipur", stateKey: "s-rj", lat: 26.9124, lng: 75.7873 },
  { key: "d-jodhpur", name: "Jodhpur", stateKey: "s-rj", lat: 26.2389, lng: 73.0243 },
  { key: "d-ajmer", name: "Ajmer", stateKey: "s-rj", lat: 26.4499, lng: 74.6399 },
  { key: "d-kota", name: "Kota", stateKey: "s-rj", lat: 25.2138, lng: 75.8648 },
  { key: "d-udaipur", name: "Udaipur", stateKey: "s-rj", lat: 24.5854, lng: 73.7125 },
  { key: "d-alwar", name: "Alwar", stateKey: "s-rj", lat: 27.5665, lng: 76.6250 },
  { key: "d-bikaner", name: "Bikaner", stateKey: "s-rj", lat: 28.0229, lng: 73.3119 },
  { key: "d-sikar", name: "Sikar", stateKey: "s-rj", lat: 27.6094, lng: 75.1399 },
  { key: "d-bharatpur", name: "Bharatpur", stateKey: "s-rj", lat: 27.2173, lng: 77.4901 },
  { key: "d-bhilwara", name: "Bhilwara", stateKey: "s-rj", lat: 25.3407, lng: 74.6313 },
  { key: "d-ahmedabad", name: "Ahmedabad", stateKey: "s-gj", lat: 23.0225, lng: 72.5714 },
  { key: "d-indore", name: "Indore", stateKey: "s-mp", lat: 22.7196, lng: 75.8577 },
  { key: "d-lucknow", name: "Lucknow", stateKey: "s-up", lat: 26.8467, lng: 80.9462 },
  { key: "d-nagpur", name: "Nagpur", stateKey: "s-mh", lat: 21.1458, lng: 79.0882 },
  { key: "d-surat", name: "Surat", stateKey: "s-gj", lat: 21.1702, lng: 72.8311 },
] as const;

/** Village name stems are combined with the district name to stay unique. */
const VILLAGE_STEMS = [
  "Bhakri", "Sunderpura", "Kalyanpura", "Rampura", "Chandpura", "Nayapura",
  "Vishnupura", "Amarpura", "Gopalpura", "Shivpura", "Devpura", "Mohanpura",
] as const;

const PROJECTS = [
  { key: "p-jpr-ring", code: "PRJ-JPR-001", name: "Jaipur Ring Road Expansion", type: "road_widening", department: "Public Works Department", districtKey: "d-jaipur", agency: "NHAI", status: "active", startOffset: -320, targetOffset: 320, lengthKm: 62.5 },
  { key: "p-rj-corridor", code: "PRJ-RJ-002", name: "Rajasthan Highway Corridor", type: "highway", department: "Public Works Department", districtKey: "d-jodhpur", agency: "NHAI", status: "active", startOffset: -300, targetOffset: 300, lengthKm: 148.2 },
  { key: "p-jpr-transit", code: "PRJ-JPR-003", name: "Jaipur Urban Transit Corridor", type: "mass_transit", department: "Urban Development Authority", districtKey: "d-jaipur", agency: "Jaipur Metro Rail Corporation", status: "at_risk", startOffset: -260, targetOffset: 340, lengthKm: 28.4 },
  { key: "p-jdr-water", code: "PRJ-JDR-004", name: "Jodhpur Water Infrastructure Project", type: "water_supply", department: "Water Resources Department", districtKey: "d-jodhpur", agency: "Jodhpur Water Supply Board", status: "delayed", startOffset: -400, targetOffset: 120, lengthKm: null },
  { key: "p-kota-connect", code: "PRJ-KTA-005", name: "Kota Regional Connectivity Project", type: "road_widening", department: "Public Works Department", districtKey: "d-kota", agency: "Rajasthan PWD", status: "active", startOffset: -240, targetOffset: 280, lengthKm: 41.8 },
  { key: "p-ajm-indus", code: "PRJ-AJM-006", name: "Ajmer Industrial Corridor", type: "industrial_park", department: "Industries Department", districtKey: "d-ajmer", agency: "RIICO", status: "planning", startOffset: -90, targetOffset: 420, lengthKm: 33.1 },
  { key: "p-udp-infra", code: "PRJ-UDP-007", name: "Udaipur Infrastructure Expansion", type: "urban_infrastructure", department: "Urban Development Authority", districtKey: "d-udaipur", agency: "Udaipur Urban Development Authority", status: "active", startOffset: -280, targetOffset: 260, lengthKm: 19.7 },
  { key: "p-rj-renew", code: "PRJ-RJ-008", name: "Rajasthan Renewable Energy Corridor", type: "renewable_energy", department: "Energy Department", districtKey: "d-bikaner", agency: "Rajasthan Rajya Vidyut Utpadan Nigam", status: "planning", startOffset: -60, targetOffset: 480, lengthKm: null },
  { key: "p-alw-logistics", code: "PRJ-ALW-009", name: "Alwar Logistics Hub Access Road", type: "road_widening", department: "Public Works Department", districtKey: "d-alwar", agency: "NHAI", status: "active", startOffset: -200, targetOffset: 220, lengthKm: 24.6 },
  { key: "p-sik-tourism", code: "PRJ-SIK-010", name: "Sikar Tourism Circuit Road", type: "tourism", department: "Tourism Department", districtKey: "d-sikar", agency: "Rajasthan Tourism Development Corporation", status: "completed", startOffset: -520, targetOffset: -160, lengthKm: 37.3 },
] as const;

/**
 * Users. The six original demo accounts are preserved EXACTLY (same emails) so
 * existing documentation and sign-in instructions keep working. The rest use
 * distinct @bhoomisetu.demo addresses and all share the same demo password.
 */
const ORIGINAL_DEMO_USERS = [
  { name: "System Administrator", email: "admin@bhoomisetu.demo", role: "super_admin", department: "Administration", districtKey: null },
  { name: "Anjali Verma", email: "dolr.officer@bhoomisetu.demo", role: "dolr_officer", department: "Directorate of Land Acquisition", districtKey: null },
  { name: "Vikram Singh", email: "state.officer@bhoomisetu.demo", role: "state_officer", department: "Revenue Department", districtKey: null },
  { name: "Raj Kumar", email: "district.officer@bhoomisetu.demo", role: "district_officer", department: "District Collector Office", districtKey: "d-jaipur" },
  { name: "Demo Landowner", email: "landowner@bhoomisetu.demo", role: "landowner", department: null, districtKey: null },
  { name: "NHAI Project Office", email: "agency@bhoomisetu.demo", role: "land_agency", department: "NHAI", districtKey: null },
] as const;

const ADDITIONAL_USERS: { name: string; email: string; role: string; department: string; districtKey: string | null; designation: string }[] = [
  { name: "Meera Joshi", email: "state.admin@bhoomisetu.demo", role: "state_admin", department: "Revenue Department", districtKey: null, designation: "Joint Secretary" },
  { name: "Suresh Patel", email: "district.admin@bhoomisetu.demo", role: "district_admin", department: "District Collector Office", districtKey: "d-jaipur", designation: "Additional Collector" },
  { name: "Kavita Rathore", email: "project.officer@bhoomisetu.demo", role: "project_officer", department: "Public Works Department", districtKey: "d-jaipur", designation: "Project Engineer" },
  { name: "Anita Sharma", email: "field.officer@bhoomisetu.demo", role: "field_officer", department: "Revenue & Survey Department", districtKey: "d-jaipur", designation: "Tehsil Officer" },
  { name: "Rohit Bansal", email: "compensation.officer@bhoomisetu.demo", role: "compensation_officer", department: "Compensation Assessment Committee", districtKey: "d-jaipur", designation: "Assessment Officer" },
  { name: "Pooja Nair", email: "rr.officer@bhoomisetu.demo", role: "rr_officer", department: "Rehabilitation & Resettlement Department", districtKey: "d-jaipur", designation: "R&R Nodal Officer" },
  { name: "Neha Saxena", email: "document.officer@bhoomisetu.demo", role: "document_officer", department: "District Land Records Office", districtKey: "d-jaipur", designation: "Record Keeper" },
  { name: "Arjun Menon", email: "grievance.officer@bhoomisetu.demo", role: "grievance_officer", department: "Grievance Redressal Authority", districtKey: "d-jaipur", designation: "Redressal Officer" },
  { name: "Read Only Viewer", email: "viewer@bhoomisetu.demo", role: "viewer", department: "Planning Commission", districtKey: "d-jaipur", designation: "Programme Assistant" },
  { name: "Mohan Lal", email: "collector.jodhpur@bhoomisetu.demo", role: "district_officer", department: "District Collector Office", districtKey: "d-jodhpur", designation: "District Collector" },
  { name: "Sunita Devi", email: "collector.kota@bhoomisetu.demo", role: "district_officer", department: "District Collector Office", districtKey: "d-kota", designation: "District Collector" },
  { name: "Ramesh Yadav", email: "collector.ajmer@bhoomisetu.demo", role: "district_officer", department: "District Collector Office", districtKey: "d-ajmer", designation: "District Collector" },
  { name: "Geeta Sharma", email: "collector.udaipur@bhoomisetu.demo", role: "district_officer", department: "District Collector Office", districtKey: "d-udaipur", designation: "District Collector" },
  { name: "Prakash Nag", email: "collector.alwar@bhoomisetu.demo", role: "district_officer", department: "District Collector Office", districtKey: "d-alwar", designation: "District Collector" },
  { name: "Lata Kumari", email: "collector.bikaner@bhoomisetu.demo", role: "district_officer", department: "District Collector Office", districtKey: "d-bikaner", designation: "District Collector" },
  { name: "Deepak Jain", email: "land.officer.jpr@bhoomisetu.demo", role: "field_officer", department: "Revenue & Survey Department", districtKey: "d-jaipur", designation: "Patwari" },
];

const OFFICER_NAMES = [
  "Raj Kumar", "Anita Sharma", "Deepak Jain", "Kavita Rathore", "Suresh Patel",
  "Meera Joshi", "Neha Saxena", "Rohit Bansal", "Pooja Nair", "Arjun Menon",
  "Mohan Lal", "Sunita Devi", "Ramesh Yadav", "Geeta Sharma",
];

const FIRST_NAMES = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Rudra", "Ananya", "Diya", "Saanvi", "Navya", "Pooja", "Neha", "Kavita", "Meera", "Sunita", "Geeta", "Lata", "Asha", "Rekha", "Shanti"];
const LAST_NAMES = ["Verma", "Sharma", "Patel", "Joshi", "Rathore", "Yadav", "Nair", "Saxena", "Menon", "Bansal", "Devi", "Kumari", "Jain", "Nag", "Lal", "Singh", "Khan", "Gupta", "Meena", "Puri"];

const LAND_USES = ["Agricultural", "Residential", "Commercial", "Industrial", "Mixed Use", "Barren", "Forest Buffer"] as const;

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

const GRIEVANCE_CATEGORIES = ["Ownership", "Compensation", "Valuation", "Document", "R&R", "Survey", "Access", "Other"] as const;
const GRIEVANCE_DESCRIPTIONS: Record<string, string[]> = {
  Ownership: ["Recorded ownership differs from the revenue record for the acquired survey.", "Multiple claimants recorded for a single parcel; ownership not reconciled."],
  Compensation: ["Assessed compensation appears below the notified market circle rate.", "Compensation amount not communicated to the affected family."],
  Valuation: ["Valuation report not updated after the market rate revision.", "Market value used for assessment was not notified to the owner."],
  Document: ["Land record copy was not provided before the public notification.", "Notification document was not served to the recorded address."],
  "R&R": ["Entitlement certificate not issued after eligibility was confirmed.", "Resettlement assistance was not provided as notified."],
  Survey: ["Boundary of the acquired plot does not match the notified description.", "Field survey was not conducted before the measurement was recorded."],
  Access: ["Access to the remaining agricultural land was blocked by the acquisition.", "Temporary access route across the acquired parcel was not maintained."],
  Other: ["General enquiry regarding the progress of the acquisition process.", "Request for clarification of the notice issued under the Act."],
};

const GRIEVANCE_STATUSES = ["open", "under_review", "escalated", "resolved", "rejected"] as const;
const GRIEVANCE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const GRIEVANCE_DEPARTMENTS = [
  "District Collector Office", "Compensation Assessment Committee", "District Land Records Office",
  "Rehabilitation & Resettlement Department", "Grievance Redressal Authority", "Revenue & Survey Department",
];

const COMP_DISPUTE = ["none", "none", "none", "under_review", "upheld", "dismissed"] as const;

// The 12 R&R statuses: the 11 specification values plus `in_progress`, which
// means the R&R process has started but is not yet completed. It is an
// active/in-flight state. This list must stay in step with
// REHABILITATION_STATUSES and with the rehabilitation_status_check constraint.
const RR_STATUSES = [
  "not_started", "in_progress", "eligibility_pending", "eligible", "entitlement_pending", "entitlement_approved",
  "assistance_pending", "assistance_provided", "resettlement_pending", "resettled", "completed", "disputed",
] as const;

const TASK_TITLES = [
  "Verify valuation document", "Review compensation approval", "Resolve grievance",
  "Complete R&R assessment", "Verify ownership record", "Schedule field survey",
  "Serve public notification", "Reconcile survey boundary", "Process land handover",
  "Approve rehabilitation entitlement", "Update risk assessment", "Archive superseded documents",
];
const TASK_DEPARTMENTS = [
  "District Land Records Office", "Compensation Assessment Committee", "Grievance Redressal Authority",
  "Rehabilitation & Resettlement Department", "Revenue & Survey Department", "District Collector Office",
];

const NOTIFICATION_TYPES = [
  "document_required", "document_rejected", "approval_pending", "task_assigned", "task_overdue",
  "deadline_approaching", "deadline_missed", "compensation_update", "rr_update",
  "grievance_update", "case_update", "risk_escalation", "ai_recommendation",
] as const;

const SETTINGS: { key: string; category: string; value: unknown; description: string }[] = [
  { key: "workflow.stage_sla_days", category: "Workflow", value: 10, description: "Default days allowed per pipeline stage before it is marked delayed." },
  { key: "workflow.auto_advance_stage", category: "Workflow", value: false, description: "Whether completing a stage automatically advances the case." },
  { key: "sla.grievance_response_days", category: "SLA", value: 30, description: "Days within which a raised grievance must be dispositioned." },
  { key: "sla.grievance_escalation_days", category: "SLA", value: 15, description: "Days after which an unassigned grievance is escalated." },
  { key: "sla.compensation_approval_days", category: "SLA", value: 21, description: "Days allowed for compensation approval after assessment." },
  { key: "risk.high_threshold", category: "Risk", value: 70, description: "Score at or above which a case is classified high risk." },
  { key: "risk.critical_threshold", category: "Risk", value: 85, description: "Score at or above which a case is classified critical." },
  { key: "risk.recompute_on_view", category: "Risk", value: true, description: "Whether the risk engine recomputes when a case is opened." },
  { key: "notifications.email_enabled", category: "Notifications", value: false, description: "Send notification emails in addition to in-app." },
  { key: "notifications.digest_frequency", category: "Notifications", value: "daily", description: "How often to roll up notifications into a digest." },
  { key: "documents.required_per_stage", category: "Documents", value: true, description: "Enforce a required document list for each pipeline stage." },
  { key: "documents.auto_expire_days", category: "Documents", value: 365, description: "Days after which an approved document is marked expired." },
  { key: "documents.max_file_size_mb", category: "Documents", value: 20, description: "Maximum upload size in megabytes." },
  { key: "security.session_timeout_hours", category: "Security", value: 8, description: "Hours before an idle session must sign in again." },
  { key: "security.max_login_attempts", category: "Security", value: 5, description: "Failed sign-in attempts before an account is temporarily locked." },
  { key: "ai.provider", category: "AI", value: "local", description: "Assistant provider. 'local' uses deterministic ground data with no external calls." },
  { key: "ai.require_citations", category: "AI", value: true, description: "Require every assistant answer to cite its source fields." },
];

// =====================================================================
// Target scale
// =====================================================================

const TARGET = {
  landowners: 120,
  parcels: 132,
  cases: 90,
  compensation: 60,
  rehabilitation: 50,
  grievances: 62,
  tasks: 110,
  notifications: 160,
  audit: 320,
  verifiedResolutions: 16,
};

const FLAGSHIP_CASE_NUMBER = "BS-2026-00124";

// =====================================================================

async function seedDemoData() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("Truncating existing data ...");
    // Order is irrelevant here because CASCADE resolves the dependencies.
    await client.query(`
      TRUNCATE TABLE
        intelligence_audit_logs, case_resolutions, alerts, risk_scores, audit_logs,
        tasks, notifications, document_versions, documents, grievances,
        rehabilitation, compensation, case_parcels, acquisition_stages,
        acquisition_cases, land_parcels, landowners, users, projects,
        villages, districts, states, system_settings
      RESTART IDENTITY CASCADE
    `);

    // ---------------------------------------------------------------
    // States
    // ---------------------------------------------------------------
    await bulkInsert(
      client,
      "states",
      [{ name: "name" }, { name: "code" }, { name: "region" }, { name: "status" }, { name: "id" }],
      STATES.map((s) => [s.name, s.code, s.region, "active", detUuid(`state:${s.key}`)]),
    );
    const stateId = new Map<string, string>(STATES.map((s) => [s.key, detUuid(`state:${s.key}`)]));
    console.log(`  states              ${STATES.length}`);

    // ---------------------------------------------------------------
    // Districts
    // ---------------------------------------------------------------
    await bulkInsert(
      client,
      "districts",
      [{ name: "name" }, { name: "code" }, { name: "state_name" }, { name: "state_id" }, { name: "id" }],
      DISTRICTS.map((d) => [
        d.name,
        `D-${d.name.slice(0, 3).toUpperCase()}`,
        STATES.find((s) => s.key === d.stateKey)!.name,
        stateId.get(d.stateKey),
        detUuid(`district:${d.key}`),
      ]),
    );
    const districtId = new Map<string, string>(DISTRICTS.map((d) => [d.key, detUuid(`district:${d.key}`)]));
    console.log(`  districts           ${DISTRICTS.length}`);

    // ---------------------------------------------------------------
    // Villages (3 per district => 45)
    // ---------------------------------------------------------------
    const villages: { id: string; key: string; name: string; districtKey: string }[] = [];
    for (const d of DISTRICTS) {
      for (let v = 0; v < 3; v++) {
        const stem = VILLAGE_STEMS[(DISTRICTS.indexOf(d) * 3 + v) % VILLAGE_STEMS.length];
        const key = `${d.key}-v${v + 1}`;
        villages.push({
          id: detUuid(`village:${key}`),
          key,
          name: `${stem} (${d.name})`,
          districtKey: d.key,
        });
      }
    }
    await bulkInsert(
      client,
      "villages",
      [
        { name: "name" }, { name: "district_id" }, { name: "block" },
        { name: "lgd_code" }, { name: "population" }, { name: "id" },
      ],
      villages.map((v, i) => [
        v.name,
        districtId.get(v.districtKey),
        `Block ${(i % 3) + 1}`,
        `LGD-${v.districtKey.toUpperCase().replace("D-", "")}-${String(i + 1).padStart(4, "0")}`,
        800 + ((i * 137) % 4200),
        v.id,
      ]),
    );
    console.log(`  villages            ${villages.length}`);

    // ---------------------------------------------------------------
    // Projects
    // ---------------------------------------------------------------
    const villageCountByDistrict = new Map<string, number>();
    for (const v of villages) {
      villageCountByDistrict.set(v.districtKey, (villageCountByDistrict.get(v.districtKey) ?? 0) + 1);
    }
    await bulkInsert(
      client,
      "projects",
      [
        { name: "name" }, { name: "project_code" }, { name: "description" },
        { name: "project_type" }, { name: "department" }, { name: "agency" },
        { name: "district_id" }, { name: "state_id" }, { name: "status" },
        { name: "start_date" }, { name: "target_date" }, { name: "village_count" },
        { name: "estimated_length_km" }, { name: "assigned_officers" }, { name: "id" },
        { name: "boundary", expr: "ST_SetSRID(ST_GeomFromText(?, 4326), 4326)" },
      ],
      PROJECTS.map((p) => {
        const d = DISTRICTS.find((x) => x.key === p.districtKey)!;
        const half = 0.05;
        const ring = [
          [d.lng - half, d.lat - half],
          [d.lng + half, d.lat - half],
          [d.lng + half, d.lat + half],
          [d.lng - half, d.lat + half],
          [d.lng - half, d.lat - half],
        ];
        return [
          p.name,
          p.code,
          `Demonstration project: ${p.name}. Fictional data for BhoomiSetu prototyping.`,
          p.type,
          p.department,
          p.agency,
          districtId.get(p.districtKey),
          stateId.get(STATES.find((s) => s.key === d.stateKey)!.key),
          p.status,
          dayOffset(p.startOffset),
          dayOffset(p.targetOffset),
          villageCountByDistrict.get(p.districtKey) ?? 0,
          p.lengthKm,
          [OFFICER_NAMES[PROJECTS.indexOf(p) % OFFICER_NAMES.length]],
          detUuid(`project:${p.key}`),
          `POLYGON((${ring.map(([x, y]) => `${x} ${y}`).join(", ")}))`,
        ];
      }),
    );
    const projectId = new Map<string, string>(PROJECTS.map((p) => [p.key, detUuid(`project:${p.key}`)]));
    console.log(`  projects            ${PROJECTS.length}`);

    // ---------------------------------------------------------------
    // Users
    // ---------------------------------------------------------------
    const passwordHash = await bcrypt.hash("demo1234", 10);
    const userRows: unknown[][] = [];
    for (const u of ORIGINAL_DEMO_USERS) {
      userRows.push([
        u.name, u.email, passwordHash, u.role,
        u.districtKey ? districtId.get(u.districtKey) : null,
        u.department ?? null,
        null, // designation
      ]);
    }
    for (const u of ADDITIONAL_USERS) {
      userRows.push([
        u.name, u.email, passwordHash, u.role,
        u.districtKey ? districtId.get(u.districtKey) : null,
        u.department,
        u.designation,
      ]);
    }
    await bulkInsert(
      client,
      "users",
      [
        { name: "name" }, { name: "email" }, { name: "password_hash" }, { name: "role" },
        { name: "district_id" }, { name: "department" }, { name: "designation" }, { name: "is_active" },
        { name: "id" },
      ],
      userRows.map((r, i) => [...r, true, detUuid(`user:${String(i + 1).padStart(3, "0")}`)]),
    );
    const allUserIds = userRows.map((_, i) => detUuid(`user:${String(i + 1).padStart(3, "0")}`));
    const userIdByEmail = new Map<string, string>([
      ...ORIGINAL_DEMO_USERS.map((u, i) => [u.email, allUserIds[i]] as const),
      ...ADDITIONAL_USERS.map((u, i) => [u.email, allUserIds[ORIGINAL_DEMO_USERS.length + i]] as const),
    ]);
    // Officers (non-landowner, non-agency) are valid task assignees.
    const officerUserIds = [
      detUuid("user:004"), // Raj Kumar, district officer
      ...allUserIds.slice(9).filter((_, idx) => idx < 8),
    ];
    console.log(`  users               ${userRows.length}`);

    // ---------------------------------------------------------------
    // Landowners (affected parties) + parcels with real PostGIS geometry
    // ---------------------------------------------------------------
    const landownerIds: string[] = [];
    const landownerRows: unknown[][] = [];
    for (let i = 0; i < TARGET.landowners; i++) {
      const id = detUuid(`landowner:${String(i + 1).padStart(4, "0")}`);
      const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7) % LAST_NAMES.length]}`;
      landownerIds.push(id);
      landownerRows.push([id, `LO-${String(i + 1).padStart(4, "0")}`, name, `+91-9${(200000000 + i * 111111).toString().slice(0, 9)}`]);
    }
    // The demo landowner account owns a handful of parcels so the landowner
    // portal has real content.
    const demoLandownerUserId = userIdByEmail.get("landowner@bhoomisetu.demo") ?? null;
    await bulkInsert(
      client,
      "landowners",
      [{ name: "id" }, { name: "landowner_ref" }, { name: "name" }, { name: "contact" }, { name: "user_id" }],
      landownerRows.map((r, i) => (i === 0 || i === 5 ? [...r, demoLandownerUserId] : [...r, null])),
    );
    console.log(`  landowners          ${landownerIds.length}`);

    // Parcels are distributed across districts/projects. Geometry is a real
    // square polygon placed around the district centroid; half-size shrinks with
    // index so parcels in a district do not sit exactly on top of each other.
    const parcelIds: string[] = [];
    const parcelRows: unknown[][] = [];
    const parcelVillage: string[] = [];
    const parcelDistrictKey: string[] = [];
    for (let i = 0; i < TARGET.parcels; i++) {
      const project = PROJECTS[i % PROJECTS.length];
      const district = DISTRICTS.find((d) => d.key === project.districtKey)!;
      const districtVillages = villages.filter((v) => v.districtKey === district.key);
      const village = districtVillages[i % districtVillages.length];
      const id = detUuid(`parcel:${String(i + 1).padStart(4, "0")}`);

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

      parcelIds.push(id);
      parcelVillage.push(village.key);
      parcelDistrictKey.push(district.key);
      parcelRows.push([
        id,
        `RJ-08-${String(100000000000 + i * 7919).slice(0, 12)}`,
        districtId.get(district.key),
        village.id,
        landownerIds[i % landownerIds.length],
        Number((1 + ((i * 37) % 90) / 10).toFixed(1)),
        LAND_USES[i % LAND_USES.length],
        // WKT for the centroid; the boundary below is a real polygon.
        `POINT(${lng} ${lat})`,
        `POLYGON((${ring.map(([x, y]) => `${x} ${y}`).join(", ")}))`,
      ]);
    }
    await bulkInsert(
      client,
      "land_parcels",
      [
        { name: "id" }, { name: "ulpin" }, { name: "district_id" }, { name: "village_id" },
        { name: "landowner_id" }, { name: "area_hectares" }, { name: "land_use" },
        { name: "centroid", expr: "ST_GeomFromText(?, 4326)" },
        { name: "boundary", expr: "ST_SetSRID(ST_GeomFromText(?, 4326), 4326)" },
      ],
      parcelRows.map((r) => r),
    );
    console.log(`  land parcels        ${parcelIds.length}`);

    // ---------------------------------------------------------------
    // Acquisition cases
    // ---------------------------------------------------------------
    // Status distribution per the specification:
    //   ~60% on_track / in_progress, 20% at_risk, 15% delayed, 5% completed
    const casePlan: {
      caseNumber: string; projectKey: string; parcelIndex: number;
      currentStage: number; status: string; riskLevel: string;
      officer: string; createdOffset: number; isFlagship: boolean;
    }[] = [];

    // Flagship first, then the rest round-robin so every project/stage is hit.
    //
    // createdOffset is chosen so the case's stage 6 (current stage) comes due
    // exactly 18 days before the anchor date: stage 6 starts at
    // createdOffset + (6 - 1) * 12 and is due 12 days after that, i.e.
    // createdOffset + 72 = -18  =>  createdOffset = -90.
    // That is what makes the recorded 18-day delay and the computed delay
    // agree, instead of contradicting each other.
    casePlan.push({
      caseNumber: FLAGSHIP_CASE_NUMBER,
      projectKey: "p-jpr-ring",
      parcelIndex: 0,
      currentStage: 6,
      status: "delayed",
      riskLevel: "high",
      officer: "Raj Kumar",
      createdOffset: -90,
      isFlagship: true,
    });

    // 60 / 20 / 15 / 5 split, applied deterministically over the non-flagship
    // cases, per the specification's requested distribution.
    //
    // The leading 60% is split between `on_track` and `in_progress` rather than
    // being all `on_track`. Both mean "progressing normally", and without the
    // split nothing in the demo dataset ever carried the `in_progress` status —
    // so the status could look broken in the UI (and be excluded from the
    // "Active Acquisitions" KPI) without any demo case revealing it.
    const nonFlagship = TARGET.cases - 1;
    const STATUS_PLAN: string[] = [];
    for (let i = 0; i < nonFlagship; i++) {
      const ratio = i / nonFlagship;
      if (ratio < 0.3) STATUS_PLAN.push("on_track");
      else if (ratio < 0.6) STATUS_PLAN.push("in_progress");
      else if (ratio < 0.8) STATUS_PLAN.push("at_risk");
      else if (ratio < 0.95) STATUS_PLAN.push("delayed");
      else STATUS_PLAN.push("completed");
    }

    for (let i = 0; i < nonFlagship; i++) {
      const status = STATUS_PLAN[i];
      // Cycle evenly through all ten stages so the dataset demonstrates every
      // stage of the pipeline, rather than piling up at the early ones. A
      // completed case necessarily sits at the final stage.
      const currentStage = status === "completed" ? 10 : 1 + (i % 10);
      const riskLevel =
        status === "delayed" ? (i % 3 === 0 ? "critical" : "high")
        : status === "at_risk" ? (i % 2 === 0 ? "medium" : "high")
        : "low";
      casePlan.push({
        caseNumber: `BS-2026-${String(200 + i).padStart(5, "0")}`,
        projectKey: PROJECTS[i % PROJECTS.length].key,
        parcelIndex: 1 + (i % (TARGET.parcels - 1)),
        currentStage,
        status,
        riskLevel,
        officer: OFFICER_NAMES[i % OFFICER_NAMES.length],
        createdOffset: -randInt(60, 400),
        isFlagship: false,
      });
    }

    const caseIdByNumber = new Map<string, string>();
    const caseIdByIndex: string[] = [];
    for (const c of casePlan) {
      caseIdByNumber.set(c.caseNumber, detUuid(`case:${c.caseNumber}`));
    }
    await bulkInsert(
      client,
      "acquisition_cases",
      [
        { name: "id" }, { name: "case_number" }, { name: "project_id" }, { name: "parcel_id" },
        { name: "district_id" }, { name: "village_id" }, { name: "current_stage" },
        { name: "status" }, { name: "risk_level" }, { name: "assigned_officer" },
        { name: "created_by" }, { name: "created_at" }, { name: "updated_at" },
      ],
      casePlan.map((c) => {
        const parcelIdx = c.parcelIndex;
        return [
          detUuid(`case:${c.caseNumber}`),
          c.caseNumber,
          projectId.get(c.projectKey),
          parcelIds[parcelIdx],
          districtId.get(parcelDistrictKey[parcelIdx]),
          villages.find((v) => v.key === parcelVillage[parcelIdx])!.id,
          c.currentStage,
          c.status,
          c.riskLevel,
          c.officer,
          detUuid("user:004"),
          dayOffset(c.createdOffset),
          dayOffset(c.createdOffset + 10),
        ];
      }),
    );
    for (let i = 0; i < casePlan.length; i++) caseIdByIndex.push(detUuid(`case:${casePlan[i].caseNumber}`));
    console.log(`  acquisition cases   ${casePlan.length}`);

    // --- case <-> parcel (primary + additional) ----------------------
    // Every parcel a case touches, so compensation and R&R can be recorded per
    // PARCEL (which is what the money actually attaches to) rather than once
    // per case.
    const parcelsByCase = new Map<string, string[]>();
    const caseParcelRows: unknown[][] = [];

    for (const c of casePlan) {
      const caseUuid = detUuid(`case:${c.caseNumber}`);
      caseParcelRows.push([caseUuid, parcelIds[c.parcelIndex], true]);
      parcelsByCase.set(c.caseNumber, [parcelIds[c.parcelIndex]]);
    }

    // Additional parcels are drawn ONLY from parcels that are not a primary for
    // any case. Compensation has a unique-per-parcel constraint, so a parcel
    // shared by two cases would be contradictory demo data.
    const usedAsPrimary = new Set(casePlan.map((c) => c.parcelIndex));
    const freeByDistrict = new Map<string, number[]>();
    for (let i = 0; i < TARGET.parcels; i++) {
      if (usedAsPrimary.has(i)) continue;
      const dk = parcelDistrictKey[i];
      if (!freeByDistrict.has(dk)) freeByDistrict.set(dk, []);
      freeByDistrict.get(dk)!.push(i);
    }

    // Extras go to cases that have reached the compensation stage, because that
    // is where money attaches to a parcel.
    for (const c of casePlan) {
      if (c.currentStage < 6) continue;
      const pool = freeByDistrict.get(parcelDistrictKey[c.parcelIndex]);
      if (!pool || pool.length === 0) continue;
      const extra = pool.shift()!;
      const caseUuid = detUuid(`case:${c.caseNumber}`);
      caseParcelRows.push([caseUuid, parcelIds[extra], false]);
      parcelsByCase.get(c.caseNumber)!.push(parcelIds[extra]);
    }
    await bulkInsert(
      client,
      "case_parcels",
      [{ name: "case_id" }, { name: "parcel_id" }, { name: "is_primary" }],
      caseParcelRows,
    );

    // ---------------------------------------------------------------
    // 10-stage workflow history
    // ---------------------------------------------------------------
    const stageRows: unknown[][] = [];
    for (const c of casePlan) {
      const caseId = detUuid(`case:${c.caseNumber}`);
      const isComplete = c.status === "completed";
      const startBase = c.createdOffset;

      PIPELINE_STAGES.forEach((stageName, index) => {
        const stageNumber = index + 1;
        const startOffset = startBase + (stageNumber - 1) * 12;

        let stageStatus: string;
        if (isComplete || stageNumber < c.currentStage) stageStatus = "completed";
        else if (stageNumber > c.currentStage) stageStatus = "not_started";
        else stageStatus = c.status === "delayed" ? "delayed" : c.status === "at_risk" ? "delayed" : "in_progress";

        const completionOffset = stageStatus === "completed" ? startOffset + 7 : null;
        const dueOffset = stageStatus === "not_started" ? null : startOffset + 12;
        const delayDays =
          stageStatus === "delayed" ? (c.isFlagship ? 18 : 4 + ((stageNumber * 3) % 11)) : null;

        stageRows.push([
          detUuid(`stage:${c.caseNumber}:${stageNumber}`),
          caseId,
          stageNumber,
          stageName,
          stageStatus,
          stageStatus === "not_started" ? null : dayOffset(startOffset),
          completionOffset === null ? null : dayOffset(completionOffset),
          dueOffset === null ? null : dayOffset(dueOffset),
          STAGE_DEPARTMENTS[stageNumber - 1],
          c.officer,
          stageStatus === "not_started"
            ? null
            : stageStatus === "delayed"
              ? `${stageName} has exceeded its scheduled deadline.`
              : stageStatus === "completed"
                ? `${stageName} completed and recorded.`
                : `${stageName} currently in progress.`,
          delayDays,
        ]);
      });
    }
    await bulkInsert(
      client,
      "acquisition_stages",
      [
        { name: "id" }, { name: "case_id" }, { name: "stage_number" }, { name: "stage_name" },
        { name: "status" }, { name: "start_date" }, { name: "completion_date" }, { name: "due_date" },
        { name: "responsible_department" }, { name: "responsible_officer" }, { name: "remarks" }, { name: "delay_days" },
      ],
      stageRows,
    );
    console.log(`  stage records       ${stageRows.length}`);

    // ---------------------------------------------------------------
    // Documents + version history
    // ---------------------------------------------------------------
    const docRows: unknown[][] = [];
    const versionRows: unknown[][] = [];
    let docSeq = 0;

    // A version records an ACTION (uploaded, submitted, verified, ...), which
    // is a different vocabulary from a document's verification STATUS
    // (pending_verification, under_review, ...). Keeping them separate is what
    // lets a history read correctly: v1 rejected, v2 uploaded, v3 submitted.
    const ACTION_TO_STATUS: Record<string, string> = {
      uploaded: "uploaded",
      submitted: "pending_verification",
      under_review: "under_review",
      verified: "verified",
      rejected: "rejected",
      superseded: "superseded",
      expired: "expired",
    };

    /** Default action chain implied by a document's current status. */
    function chainForStatus(status: string): string[] {
      switch (status) {
        case "verified": return ["uploaded", "submitted", "verified"];
        case "pending_verification": return ["uploaded", "submitted"];
        case "under_review": return ["uploaded", "submitted", "under_review"];
        case "rejected": return ["uploaded", "submitted", "rejected"];
        default: return ["uploaded"];
      }
    }

    const addDocument = (
      caseNumber: string,
      category: string,
      status: string,
      required: boolean,
      createdOffset: number,
      versionChain?: string[],
    ) => {
      docSeq += 1;
      const chain = versionChain ?? chainForStatus(status);
      const docId = detUuid(`document:${String(docSeq).padStart(5, "0")}`);
      const docRef = `DOC-${String(docSeq).padStart(5, "0")}`;
      const casePlan_ = casePlan.find((c) => c.caseNumber === caseNumber)!;
      const fileName = `${category.replace(/[^a-zA-Z0-9]+/g, "_")}_${caseNumber}_v${chain.length}.pdf`;
      docRows.push([
        docId,
        docRef,
        detUuid(`case:${caseNumber}`),
        category,
        category,
        fileName,
        `demo-storage/${caseNumber}/${fileName}`,
        casePlan_.officer,
        status,
        chain.length,
        required,
        dayOffset(createdOffset),
      ]);
      chain.forEach((action, vi) => {
        const isLast = vi === chain.length - 1;
        // The final version reflects the document's actual current status; the
        // earlier ones reflect the state implied by their own action.
        const versionStatus = isLast ? status : ACTION_TO_STATUS[action];
        versionRows.push([
          detUuid(`docver:${String(docSeq).padStart(5, "0")}:${vi + 1}`),
          docId,
          vi + 1,
          action,
          fileName,
          versionStatus,
          `Version ${vi + 1} (${action.replace(/_/g, " ")})`,
          casePlan_.officer,
          dayOffset(createdOffset + vi * 3),
        ]);
      });
      return docId;
    };

    for (const c of casePlan) {
      const isComplete = c.status === "completed";
      DOCUMENT_CATEGORIES.forEach((category, index) => {
        const stageNumber = index + 1;
        let status: string | null;
        if (stageNumber < c.currentStage || isComplete) status = "verified";
        else if (stageNumber === c.currentStage) {
          status = c.status === "delayed" ? "under_review" : c.status === "at_risk" ? "pending_verification" : "pending_verification";
        } else status = null; // future stage, no document yet

        if (!status) return;

        const startOffset = c.createdOffset + (stageNumber - 1) * 12;

        if (c.isFlagship && stageNumber === 6) {
          // The flagship's valuation report is the document the intelligence
          // engine should surface as a contributing factor.
          addDocument(c.caseNumber, "Valuation Report", "under_review", true, startOffset, ["rejected", "uploaded", "under_review"]);
        } else if (stageNumber === 3 && c.status === "at_risk") {
          addDocument(c.caseNumber, category, "verified", true, startOffset, ["uploaded", "verified"]);
        } else if (stageNumber === 2 && c.status === "delayed" && c.caseNumber !== FLAGSHIP_CASE_NUMBER) {
          addDocument(c.caseNumber, category, "rejected", true, startOffset, ["uploaded", "rejected", "uploaded", "verified"]);
        } else {
          addDocument(c.caseNumber, category, status, stageNumber <= 5, startOffset);
        }
      });

      // A required document that was never uploaded — the "missing" state.
      if (c.status === "delayed" && !c.isFlagship && c.caseNumber.endsWith("7")) {
        docSeq += 1;
        const docId = detUuid(`document:${String(docSeq).padStart(5, "0")}`);
        docRows.push([
          docId,
          `DOC-${String(docSeq).padStart(5, "0")}`,
          detUuid(`case:${c.caseNumber}`),
          "Legal Clearance",
          "Legal Clearance",
          `Legal_Clearance_${c.caseNumber}_missing.pdf`,
          `demo-storage/${c.caseNumber}/missing.pdf`,
          c.officer,
          "missing",
          0,
          true,
          dayOffset(c.createdOffset),
        ]);
      }
    }
    await bulkInsert(
      client,
      "documents",
      [
        { name: "id" }, { name: "document_ref" }, { name: "case_id" }, { name: "document_type" },
        { name: "category" }, { name: "file_name" }, { name: "storage_path" }, { name: "uploaded_by" },
        { name: "verification_status" }, { name: "current_version" }, { name: "is_required" }, { name: "created_at" },
      ],
      docRows,
    );
    await bulkInsert(
      client,
      "document_versions",
      [
        { name: "id" }, { name: "document_id" }, { name: "version_number" }, { name: "action" },
        { name: "file_name" }, { name: "verification_status" }, { name: "remarks" },
        { name: "uploaded_by" }, { name: "created_at" },
      ],
      versionRows,
    );
    console.log(`  documents           ${docRows.length} (with ${versionRows.length} version records)`);

    // ---------------------------------------------------------------
    // Compensation
    // ---------------------------------------------------------------
    const compRows: unknown[][] = [];
    for (const c of casePlan) {
      // Compensation can only exist for a case that reached assessment, and it
      // attaches to a PARCEL. Both constraints matter: seeding compensation for
      // a stage-2 case would be data the running app could never produce.
      if (c.currentStage < 6 && c.status !== "completed") continue;
      if (compRows.length >= TARGET.compensation) break;

      const isComplete = c.status === "completed";
      const isFlagship = c.isFlagship;
      const caseUuid = detUuid(`case:${c.caseNumber}`);
      const caseParcels = parcelsByCase.get(c.caseNumber) ?? [parcelIds[c.parcelIndex]];

      for (const parcelId of caseParcels) {
        if (compRows.length >= TARGET.compensation) break;
        const parcelIdx = parcelIds.indexOf(parcelId);

        // The flagship must read APPROVAL_PENDING at stage 6, which is what
        // makes its compensation the primary blocker in the intelligence engine.
        const approval = isFlagship && parcelId === parcelIds[0] ? "approval_pending"
          : isComplete ? "approved"
          : c.currentStage === 6 ? "assessment_pending"
          : c.currentStage === 7 ? "payment_pending"
          : "approved";

        const disbursement = isComplete ? "paid"
          : approval === "approved" ? "payment_pending"
          : "pending";

        const assessed = (parcelIdx + 5) * 275000;
        const approvedAmount = approval === "approved" || disbursement === "paid" ? assessed : null;
        const paidAmount = disbursement === "paid" ? assessed : null;

        // Assessment happens when the case reaches the compensation stage;
        // approval is only dated once it has actually been granted.
        const assessedOn = dayOffset(c.createdOffset + 60);
        // Approval is dated only once it has actually been granted —
        // "payment_pending" means approved but not yet paid out.
        const approvalGranted = approval === "approved" || approval === "payment_pending";
        const approvedOn = approvalGranted ? dayOffset(c.createdOffset + 92) : null;
        // When the record last changed. For a still-pending approval this is
        // when the approval was raised, NOT the moment the seed ran — otherwise
        // every case would read "updated today" and the intelligence engine
        // would (correctly) refuse to say how long approval has been waiting.
        const updatedOn = disbursement === "paid"
          ? dayOffset(c.createdOffset + 200)
          : approvedOn ?? assessedOn;

        compRows.push([
          detUuid(`compensation:${parcelId}`),
          caseUuid,
          parcelId,
          // The case's primary parcel is the one existing readers treat as
          // "this case's compensation".
          parcelId === parcelIds[c.parcelIndex],
          assessed,
          approvedAmount,
          paidAmount,
          assessed,
          approval,
          disbursement,
          disbursement === "paid" ? dayOffset(c.createdOffset + 200) : null,
          disbursement === "paid" ? `PAY-2026-${String(parcelIdx).padStart(5, "0")}` : null,
          assessedOn,
          approvedOn,
          pick(COMP_DISPUTE),
          updatedOn,
        ]);
      }
    }
    await bulkInsert(
      client,
      "compensation",
      [
        { name: "id" }, { name: "case_id" }, { name: "parcel_id" }, { name: "is_primary" },
        { name: "assessment_amount" },
        { name: "approved_amount" }, { name: "paid_amount" }, { name: "market_value" },
        { name: "approval_status" }, { name: "disbursement_status" }, { name: "payment_date" },
        { name: "payment_reference" }, { name: "assessment_date" }, { name: "approval_date" },
        { name: "dispute_status" }, { name: "updated_at" },
      ],
      compRows,
    );
    console.log(`  compensation         ${compRows.length}`);

    // ---------------------------------------------------------------
    // Rehabilitation & Resettlement
    // ---------------------------------------------------------------
    const rrRows: unknown[][] = [];
    // Completed cases are visited first. Their rows are the only source of the
    // terminal "completed" status, and walking casePlan in its natural order
    // exhausted the row budget before ever reaching them, which pinned the
    // completion-rate metric at 0% and left the `completed` filter empty.
    // Grouping preserves relative order inside each part, so the seed stays
    // deterministic.
    const rrCandidates = [
      ...casePlan.filter((c) => c.status === "completed"),
      ...casePlan.filter((c) => c.status !== "completed"),
    ];
    for (const c of rrCandidates) {
      // R&R begins once a case reaches the resettlement stage of the pipeline.
      // Seeding it for early-stage cases would be data the real workflow could
      // never produce, so the count is bounded by the case distribution.
      // The flagship is the deliberate exception: the specification requires it
      // to show R&R partially complete alongside a stage-6 blockage, which is
      // realistic because entitlements are commonly prepared in parallel.
      if (!c.isFlagship && c.currentStage < 7 && c.status !== "completed") continue;
      if (rrRows.length >= TARGET.rehabilitation) break;

      const isComplete = c.status === "completed";
      const caseUuid = detUuid(`case:${c.caseNumber}`);
      const caseParcels = parcelsByCase.get(c.caseNumber) ?? [parcelIds[c.parcelIndex]];

      for (const parcelId of caseParcels) {
        if (rrRows.length >= TARGET.rehabilitation) break;
        const parcelIdx = parcelIds.indexOf(parcelId);

        const status = isComplete ? "completed"
          : c.isFlagship && parcelId === parcelIds[0] ? "assistance_pending"
          : pick(RR_STATUSES.filter((s) => s !== "completed"));

        // `in_progress` gets its own wording rather than falling through to the
        // generic pending text, so a record in that state reads as work actually
        // underway instead of indistinguishable from a queued case.
        const delivered = status === "completed" || status === "assistance_provided";

        rrRows.push([
          detUuid(`rehab:${parcelId}`),
          caseUuid,
          parcelId,
          `${FIRST_NAMES[parcelIdx % FIRST_NAMES.length]} ${LAST_NAMES[(parcelIdx * 7) % LAST_NAMES.length]} family household`,
          status === "not_started" ? "not_assessed" : status === "completed" ? "eligible" : pick(["eligible", "under_assessment"]),
          status === "completed" ? "Entitlement certificate issued"
            : status === "not_started" ? null
            // in_progress is active work, which reads differently from the
            // queued "under consideration" wording used for pending states.
            : status === "in_progress" ? "Entitlement process underway"
            : "Entitlement under consideration",
          delivered ? "House site and financial assistance provided" : "Assistance pending",
          status === "completed" ? "House completed" : status === "assistance_pending" ? "House site identified" : null,
          status === "completed" ? "Land-based livelihood restored" : null,
          status === "completed" ? "Settled at resettlement colony" : null,
          status,
          status === "completed" ? "All entitlements delivered" : "Package under implementation",
          dayOffset(c.createdOffset + 150),
        ]);
      }
    }
    await bulkInsert(
      client,
      "rehabilitation",
      [
        { name: "id" }, { name: "case_id" }, { name: "parcel_id" }, { name: "affected_family" },
        { name: "eligibility" }, { name: "entitlement" }, { name: "assistance" }, { name: "housing" },
        { name: "livelihood" }, { name: "resettlement" }, { name: "status" }, { name: "details" },
        { name: "target_date" },
      ],
      rrRows,
    );
    console.log(`  rehabilitation       ${rrRows.length}`);

    // ---------------------------------------------------------------
    // Grievances
    // ---------------------------------------------------------------
    const grievanceRows: unknown[][] = [];
    for (let i = 0; i < TARGET.grievances; i++) {
      const c = casePlan[i % casePlan.length];
      const category = GRIEVANCE_CATEGORIES[i % GRIEVANCE_CATEGORIES.length];
      const status = i === 0 ? "open" : pick(GRIEVANCE_STATUSES);
      const submittedOffset = -randInt(10, 320);
      // SLA is 30 days; older unresolved grievances are deliberately overdue.
      grievanceRows.push([
        detUuid(`grievance:${String(i + 1).padStart(4, "0")}`),
        `GRV-2026-${String(i + 1).padStart(5, "0")}`,
        `GRV-REF-${String(i + 1).padStart(5, "0")}`,
        detUuid(`case:${c.caseNumber}`),
        parcelIds[c.parcelIndex],
        landownerIds[c.parcelIndex % landownerIds.length],
        category,
        pick(GRIEVANCE_DESCRIPTIONS[category]),
        pick(GRIEVANCE_PRIORITIES),
        status,
        status === "open" ? null : OFFICER_NAMES[i % OFFICER_NAMES.length],
        pick(GRIEVANCE_DEPARTMENTS),
        dayOffset(submittedOffset),
        dayOffset(submittedOffset + 30),
        status === "resolved" || status === "rejected" ? dayOffset(submittedOffset + randInt(8, 40)) : null,
        status === "resolved" ? "Grievance resolved after hearing and documentary verification." : status === "rejected" ? "Grievance rejected: the matter is covered by an earlier notification." : null,
      ]);
    }
    await bulkInsert(
      client,
      "grievances",
      [
        { name: "id" }, { name: "grievance_number" }, { name: "reference_number" }, { name: "case_id" },
        { name: "parcel_id" }, { name: "landowner_id" }, { name: "category" }, { name: "description" },
        { name: "priority" }, { name: "status" }, { name: "assigned_officer" }, { name: "assigned_department" },
        { name: "submitted_date" }, { name: "sla_date" }, { name: "resolved_date" }, { name: "resolution" },
      ],
      grievanceRows,
    );
    console.log(`  grievances           ${grievanceRows.length}`);

    // ---------------------------------------------------------------
    // Tasks
    // ---------------------------------------------------------------
    const taskRows: unknown[][] = [];
    for (let i = 0; i < TARGET.tasks; i++) {
      const c = casePlan[i % casePlan.length];
      const status = i % 6 === 0 ? "overdue" : i % 4 === 0 ? "completed" : pick(["todo", "in_progress", "blocked", "todo"]);
      const dueOffset = c.createdOffset + randInt(-20, 60);
      taskRows.push([
        detUuid(`task:${String(i + 1).padStart(4, "0")}`),
        `TASK-2026-${String(i + 1).padStart(5, "0")}`,
        TASK_TITLES[i % TASK_TITLES.length],
        `Operational task for acquisition case ${c.caseNumber}.`,
        detUuid(`case:${c.caseNumber}`),
        projectId.get(c.projectKey),
        parcelIds[c.parcelIndex],
        officerUserIds[i % officerUserIds.length],
        TASK_DEPARTMENTS[i % TASK_DEPARTMENTS.length],
        pick(["low", "medium", "high", "critical"]),
        status,
        dayOffset(dueOffset),
        status === "in_progress" || status === "blocked" ? dayOffset(dueOffset - 20) : null,
        status === "completed" ? dayOffset(dueOffset - 5) : null,
      ]);
    }
    // The flagship needs an explicitly overdue approval-review task.
    const flagshipTaskOffset = casePlan[0].createdOffset + 40;
    taskRows.push([
      detUuid("task:flagship-approval"),
      "TASK-2026-90001",
      "Review compensation approval",
      "Approval review for the flagship case; pending beyond the SLA.",
      detUuid(`case:${FLAGSHIP_CASE_NUMBER}`),
      projectId.get("p-jpr-ring"),
      parcelIds[0],
      officerUserIds[0],
      "Compensation Assessment Committee",
      "critical",
      "overdue",
      dayOffset(flagshipTaskOffset),
      dayOffset(flagshipTaskOffset - 10),
      null,
    ]);
    await bulkInsert(
      client,
      "tasks",
      [
        { name: "id" }, { name: "task_ref" }, { name: "title" }, { name: "description" },
        { name: "case_id" }, { name: "project_id" }, { name: "parcel_id" }, { name: "assigned_to" },
        { name: "department" }, { name: "priority" }, { name: "status" }, { name: "due_date" },
        { name: "started_at" }, { name: "completed_at" },
      ],
      taskRows,
    );
    console.log(`  tasks                ${taskRows.length}`);

    // ---------------------------------------------------------------
    // Notifications
    // ---------------------------------------------------------------
    const notificationRows: unknown[][] = [];
    for (let i = 0; i < TARGET.notifications; i++) {
      const c = casePlan[i % casePlan.length];
      const type = NOTIFICATION_TYPES[i % NOTIFICATION_TYPES.length];
      const recipient = allUserIds[i % allUserIds.length];
      notificationRows.push([
        detUuid(`notification:${String(i + 1).padStart(5, "0")}`),
        recipient,
        detUuid(`case:${c.caseNumber}`),
        projectId.get(c.projectKey),
        type,
        type.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
        `Case ${c.caseNumber}: ${type.replace(/_/g, " ")} requires attention.`,
        i % 3 === 0,
        i % 4 === 0 ? "high" : "normal",
        "acquisition_case",
        detUuid(`case:${c.caseNumber}`),
        `/dashboard/cases/${c.caseNumber}`,
        dayOffset(-randInt(0, 200)),
      ]);
    }
    await bulkInsert(
      client,
      "notifications",
      [
        { name: "id" }, { name: "user_id" }, { name: "case_id" }, { name: "project_id" },
        { name: "type" }, { name: "title" }, { name: "message" }, { name: "is_read" },
        { name: "priority" }, { name: "entity_type" }, { name: "entity_id" }, { name: "action_url" },
        { name: "created_at" },
      ],
      notificationRows,
    );
    console.log(`  notifications        ${notificationRows.length}`);

    // ---------------------------------------------------------------
    // Audit log
    // ---------------------------------------------------------------
    const AUDIT_ACTIONS = [
      { action: "LOGIN", entity: "user" },
      { action: "CREATE_PROJECT", entity: "project" },
      { action: "UPDATE_PROJECT", entity: "project" },
      { action: "CREATE_CASE", entity: "acquisition_case" },
      { action: "UPDATE_CASE", entity: "acquisition_case" },
      { action: "STAGE_UPDATED", entity: "acquisition_stage" },
      { action: "UPLOAD_DOCUMENT", entity: "document" },
      { action: "VERIFY_DOCUMENT", entity: "document" },
      { action: "REJECT_DOCUMENT", entity: "document" },
      { action: "UPDATE_COMPENSATION", entity: "compensation" },
      { action: "UPDATE_RR", entity: "rehabilitation" },
      { action: "CREATE_GRIEVANCE", entity: "grievance" },
      { action: "ASSIGN_TASK", entity: "task" },
      { action: "COMPLETE_TASK", entity: "task" },
      { action: "GENERATE_REPORT", entity: "report" },
      { action: "AI_ANALYSIS", entity: "acquisition_case" },
      { action: "CREATE_RESOLUTION", entity: "case_resolution" },
      { action: "VERIFY_RESOLUTION", entity: "case_resolution" },
    ];
    const auditRows: unknown[][] = [];
    for (let i = 0; i < TARGET.audit; i++) {
      const c = casePlan[i % casePlan.length];
      const spec = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length];
      const actor = allUserIds[i % allUserIds.length];
      const role = i % allUserIds.length < ORIGINAL_DEMO_USERS.length
        ? ORIGINAL_DEMO_USERS[i % ORIGINAL_DEMO_USERS.length].role
        : ADDITIONAL_USERS[(i % allUserIds.length) - ORIGINAL_DEMO_USERS.length].role;
      auditRows.push([
        detUuid(`audit:${String(i + 1).padStart(5, "0")}`),
        actor,
        role,
        spec.action,
        spec.entity,
        detUuid(`case:${c.caseNumber}`),
        detUuid(`case:${c.caseNumber}`),
        projectId.get(c.projectKey),
        JSON.stringify({ note: `previous ${spec.action} value` }),
        JSON.stringify({ note: `new ${spec.action} value` }),
        `10.0.${(i % 250) + 1}.${(i % 200) + 2}`,
        dayOffset(-randInt(0, 400)),
      ]);
    }
    await bulkInsert(
      client,
      "audit_logs",
      [
        { name: "id" }, { name: "user_id" }, { name: "user_role" }, { name: "action" },
        { name: "entity" }, { name: "entity_id" }, { name: "case_id" }, { name: "project_id" },
        { name: "previous_value" }, { name: "new_value" }, { name: "ip_address" }, { name: "created_at" },
      ],
      auditRows,
    );
    console.log(`  audit events         ${auditRows.length}`);

    // ---------------------------------------------------------------
    // Risk scores — computed by the EXISTING engine, never hardcoded.
    // ---------------------------------------------------------------
    const { computeRiskForCases } = await import("../services/riskEngineService.js");
    const riskComputed = await computeRiskForCases(caseIdByIndex, client);
    console.log(`  risk scores          ${riskComputed} (computed by the risk engine)`);

    // ---------------------------------------------------------------
    // Verified resolutions (institutional memory)
    // ---------------------------------------------------------------
    const PRECEDENT_LIBRARY = [
      { problemType: "approval_blocker", stage: 6, dept: "Compensation Assessment Committee",
        problem: "Compensation approval remained pending after assessment because the valuation supporting document was still awaiting verification.",
        cause: "The valuation certificate was uploaded after the assessment was submitted, so the approval packet was incomplete.",
        action: "Verified the valuation certificate, then reopened the approval workflow with a note referencing the verified document." },
      { problemType: "document_blocker", stage: 6, dept: "District Land Records Office",
        problem: "Stage could not complete because a pending-verification document was never actioned, leaving the assessment unsupported.",
        cause: "No one was assigned to clear the pending verification queue for the stage.",
        action: "Assigned document verification to the case officer and cleared the queue within the same working day." },
      { problemType: "grievance_blocker", stage: 5, dept: "Grievance Redressal Authority",
        problem: "A compensation grievance remained unresolved after public notification, holding up the transition to assessment.",
        cause: "The grievance was not routed to the redressal authority within the standard timeframe.",
        action: "Routed the grievance to the district redressal authority and recorded a hearing date." },
      { problemType: "r_and_r_blocker", stage: 8, dept: "Rehabilitation & Resettlement Department",
        problem: "Land handover stalled because the R&R entitlement certificate had not been issued.",
        cause: "Eligibility confirmation was pending with the district collector while the package was already prepared.",
        action: "Obtained the eligibility confirmation and issued the entitlement certificate before handover." },
      { problemType: "ownership_verification_blocker", stage: 2, dept: "District Land Records Office",
        problem: "Ownership verification could not be concluded because two claimants were recorded for one parcel.",
        cause: "An outdated revenue entry was not reconciled against the latest jamabandi.",
        action: "Reconciled the revenue entry, recorded the correct owner, and closed the ownership query." },
      { problemType: "payment_blocker", stage: 7, dept: "District Treasury",
        problem: "Approved compensation was not released because the treasury warrant was not generated.",
        cause: "The payment file was submitted without the approval endorsement required by the treasury.",
        action: "Attached the approval endorsement and regenerated the warrant; payment completed in the next cycle." },
      { problemType: "legal_blocker", stage: 4, dept: "District Collector Office",
        problem: "Verification and approval could not proceed while the legal clearance was contested.",
        cause: "The clearance had been issued against a superseded revenue map.",
        action: "Reissued the legal clearance against the current map and recorded the reference on the case." },
      { problemType: "survey_blocker", stage: 1, dept: "Revenue & Survey Department",
        problem: "Land identification stalled because the field survey had not been conducted.",
        cause: "Survey staff were not deployed for the notified village within the planned window.",
        action: "Deployed the survey team and recorded measured boundaries against the notified description." },
    ];

    const recorderId = detUuid("user:004");
    const verifierIds = [detUuid("user:003"), detUuid("user:007")];
    const resolutionRows: unknown[][] = [];
    for (let i = 0; i < TARGET.verifiedResolutions; i++) {
      const p = PRECEDENT_LIBRARY[i % PRECEDENT_LIBRARY.length];
      // Precedents live on OTHER cases so they are retrievable for the
      // flagship rather than self-referential.
      const hostCase = casePlan[1 + (i % (casePlan.length - 1))];
      resolutionRows.push([
        detUuid(`resolution:${String(i + 1).padStart(4, "0")}`),
        detUuid(`case:${hostCase.caseNumber}`),
        p.problemType,
        p.stage,
        p.problem,
        p.cause,
        p.action,
        p.dept,
        `${p.action.split(".")[0]}. The blockage was cleared and the case advanced.`,
        "Resolution verified; the case proceeded to the next stage.",
        dayOffset(-randInt(60, 400)),
        `verified`,
        recorderId,
        // Never let the recorder verify their own resolution.
        verifierIds[i % verifierIds.length] === recorderId ? verifierIds[(i + 1) % verifierIds.length] : verifierIds[i % verifierIds.length],
      ]);
    }
    await bulkInsert(
      client,
      "case_resolutions",
      [
        { name: "id" }, { name: "case_id" }, { name: "problem_type" }, { name: "stage_number" },
        { name: "problem_description" }, { name: "root_cause" }, { name: "action_taken" },
        { name: "responsible_department" }, { name: "resolution" }, { name: "outcome" },
        { name: "resolution_date" }, { name: "status" }, { name: "recorded_by" }, { name: "verified_by" },
      ],
      resolutionRows,
    );
    console.log(`  verified resolutions ${resolutionRows.length}`);

    // ---------------------------------------------------------------
    // Alerts (deterministic keys so a re-scan updates, never duplicates)
    // ---------------------------------------------------------------
    const alertRows: unknown[][] = [];
    for (const c of casePlan) {
      if (c.status === "delayed") {
        alertRows.push([
          detUuid(`alert:deadline:${c.caseNumber}`),
          `deadline_missed:${c.caseNumber}:stage${c.currentStage}`,
          detUuid(`case:${c.caseNumber}`),
          projectId.get(c.projectKey),
          "deadline_missed",
          c.isFlagship ? "critical" : c.riskLevel,
          `Stage ${c.currentStage} deadline exceeded`,
          `Case ${c.caseNumber} has exceeded its scheduled deadline for stage ${c.currentStage}.`,
          "acquisition_case",
          detUuid(`case:${c.caseNumber}`),
        ]);
      }
      if (c.riskLevel === "high" || c.riskLevel === "critical") {
        alertRows.push([
          detUuid(`alert:risk:${c.caseNumber}`),
          `high_risk:${c.caseNumber}`,
          detUuid(`case:${c.caseNumber}`),
          projectId.get(c.projectKey),
          "high_risk_case",
          c.riskLevel,
          `High risk case: ${c.caseNumber}`,
          `Case ${c.caseNumber} carries a ${c.riskLevel} risk classification.`,
          "acquisition_case",
          detUuid(`case:${c.caseNumber}`),
        ]);
      }
    }
    await bulkInsert(
      client,
      "alerts",
      [
        { name: "id" }, { name: "alert_key" }, { name: "case_id" }, { name: "project_id" },
        { name: "alert_type" }, { name: "severity" }, { name: "title" }, { name: "message" },
        { name: "entity_type" }, { name: "entity_id" },
      ],
      alertRows,
    );
    console.log(`  alerts               ${alertRows.length}`);

    // ---------------------------------------------------------------
    // System settings
    // ---------------------------------------------------------------
    await bulkInsert(
      client,
      "system_settings",
      [{ name: "key" }, { name: "category" }, { name: "value" }, { name: "description" }, { name: "updated_by" }],
      SETTINGS.map((s) => [s.key, s.category, JSON.stringify(s.value), s.description, detUuid("user:001")]),
    );
    console.log(`  settings             ${SETTINGS.length}`);

    await client.query("COMMIT");
    console.log("\nDemo dataset seeded successfully.");
    console.log("All records are fictional demonstration data, not government records.");
    console.log(`Sign in with any @bhoomisetu.demo account (password: demo1234).`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Demo seed failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seedDemoData().catch(() => process.exit(1));
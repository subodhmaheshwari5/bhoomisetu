// -----------------------------------------------------------------------
// DEMO DATA — BhoomiSetu prototype
//
// Every record here is fictional and generated for demonstration only.
// None of it represents real citizens, real land parcels, real government
// figures, or real payment transactions. See README.md, section
// "Demo data & disclaimers" before reusing this file.
// -----------------------------------------------------------------------

import type {
  AcquisitionCase,
  District,
  KpiSummary,
  LandParcel,
  PriorityAlert,
  Project,
} from "../types";

export const DISTRICTS: District[] = [
  { id: "d-jaipur", name: "Jaipur", stateName: "Rajasthan" },
  { id: "d-jodhpur", name: "Jodhpur", stateName: "Rajasthan" },
  { id: "d-kota", name: "Kota", stateName: "Rajasthan" },
  { id: "d-ajmer", name: "Ajmer", stateName: "Rajasthan" },
  { id: "d-udaipur", name: "Udaipur", stateName: "Rajasthan" },
];

export const PROJECTS: Project[] = [
  { id: "p-01", name: "Jaipur Ring Road", agency: "NHAI", districtId: "d-jaipur" },
  { id: "p-02", name: "Jaipur Metro Phase II", agency: "Jaipur Metro Rail Corp.", districtId: "d-jaipur" },
  { id: "p-03", name: "Jodhpur Industrial Corridor", agency: "RIICO", districtId: "d-jodhpur" },
  { id: "p-04", name: "Jodhpur–Pali Rail Link", agency: "Indian Railways", districtId: "d-jodhpur" },
  { id: "p-05", name: "Kota Thermal Expansion", agency: "Rajasthan Rajya Vidyut Utpadan Nigam", districtId: "d-kota" },
  { id: "p-06", name: "Kota Barrage Canal Widening", agency: "Water Resources Dept.", districtId: "d-kota" },
  { id: "p-07", name: "Ajmer Smart City Transit Hub", agency: "Ajmer Smart City Ltd.", districtId: "d-ajmer" },
  { id: "p-08", name: "Ajmer–Beawar Highway Expansion", agency: "NHAI", districtId: "d-ajmer" },
  { id: "p-09", name: "Udaipur Airport Approach Road", agency: "PWD Rajasthan", districtId: "d-udaipur" },
  { id: "p-10", name: "Udaipur Lakeside Sewerage Project", agency: "Urban Development Dept.", districtId: "d-udaipur" },
];

const LAND_USES = ["Agricultural", "Barren", "Residential", "Mixed Use", "Forest Buffer"];

// Approximate district-seat coordinates, used only to scatter demo parcels
// on the GIS map — not survey-accurate boundaries.
export const DISTRICT_CENTERS: Record<string, { lat: number; lng: number }> = {
  "d-jaipur": { lat: 26.9124, lng: 75.7873 },
  "d-jodhpur": { lat: 26.2389, lng: 73.0243 },
  "d-kota": { lat: 25.2138, lng: 75.8648 },
  "d-ajmer": { lat: 26.4499, lng: 74.6399 },
  "d-udaipur": { lat: 24.5854, lng: 73.7125 },
};

function ulpinFor(index: number): string {
  const body = String(100000000000 + index * 7919).slice(0, 12);
  return `RJ-08-${body}`;
}

function squareBoundary(lat: number, lng: number, halfSide = 0.006): [number, number][] {
  return [
    [lat - halfSide, lng - halfSide],
    [lat - halfSide, lng + halfSide],
    [lat + halfSide, lng + halfSide],
    [lat + halfSide, lng - halfSide],
    [lat - halfSide, lng - halfSide],
  ];
}

export const PARCELS: LandParcel[] = Array.from({ length: 20 }, (_, i) => {
  const project = PROJECTS[i % PROJECTS.length];
  const district = DISTRICTS.find((d) => d.id === project.districtId)!;
  const base = DISTRICT_CENTERS[district.id];
  // Deterministic scatter around the district center — no Math.random, so
  // the map layout is stable across reloads.
  const angle = ((i * 47) % 360) * (Math.PI / 180);
  const radius = 0.02 + ((i * 13) % 40) / 1000;
  const lat = Number((base.lat + radius * Math.cos(angle)).toFixed(5));
  const lng = Number((base.lng + radius * Math.sin(angle)).toFixed(5));

  return {
    id: `parcel-${String(i + 1).padStart(3, "0")}`,
    ulpin: ulpinFor(i + 1),
    districtId: district.id,
    stateName: district.stateName,
    areaHectares: Number((1 + ((i * 37) % 90) / 10).toFixed(1)),
    landUse: LAND_USES[i % LAND_USES.length],
    landownerRef: `LO-${String(i + 1).padStart(4, "0")}`,
    centroid: { lat, lng },
    boundary: squareBoundary(lat, lng),
  };
});

const CASE_STATUSES: AcquisitionCase["status"][] = [
  "on_track",
  "in_progress",
  "at_risk",
  "delayed",
  "completed",
  "on_hold",
];
const RISK_LEVELS: AcquisitionCase["riskLevel"][] = ["low", "medium", "high", "critical"];
const OFFICERS = [
  "Raj Kumar",
  "Anita Sharma",
  "Vikram Singh",
  "Meera Joshi",
  "Suresh Patel",
  "Kavita Rathore",
];

function caseNumberFor(seq: number): string {
  return `BS-2026-${String(seq).padStart(5, "0")}`;
}

export const CASES: AcquisitionCase[] = Array.from({ length: 15 }, (_, i) => {
  const seq = i + 100; // leaves room for the flagship demo case below
  const parcel = PARCELS[i % PARCELS.length];
  const project = PROJECTS[i % PROJECTS.length];
  return {
    id: `case-${String(i + 1).padStart(3, "0")}`,
    caseNumber: caseNumberFor(seq),
    projectId: project.id,
    parcelId: parcel.id,
    districtId: parcel.districtId,
    currentStage: 1 + (i % 10),
    status: CASE_STATUSES[i % CASE_STATUSES.length],
    riskLevel: RISK_LEVELS[i % RISK_LEVELS.length],
    assignedOfficer: OFFICERS[i % OFFICERS.length],
    createdAt: `2026-0${1 + (i % 6)}-${String(4 + i).padStart(2, "0")}`,
    updatedAt: `2026-0${2 + (i % 6)}-${String(6 + i).padStart(2, "0")}`,
  };
});

// The flagship end-to-end demo case referenced throughout the SIH walkthrough.
export const FLAGSHIP_CASE: AcquisitionCase = {
  id: "case-flagship",
  caseNumber: "BS-2026-00124",
  projectId: "p-01",
  parcelId: "parcel-001",
  districtId: "d-jaipur",
  currentStage: 6,
  status: "delayed",
  riskLevel: "high",
  assignedOfficer: "Raj Kumar",
  createdAt: "2026-08-12",
  updatedAt: "2026-09-05",
};

CASES.unshift(FLAGSHIP_CASE);

export function computeKpiSummary(cases: AcquisitionCase[] = CASES): KpiSummary {
  return {
    totalCases: cases.length,
    // Matches the backend KPI definition: work that is genuinely moving.
    // `in_progress` is ordinary progress and belongs here; `on_hold` is paused.
    activeAcquisitions: cases.filter(
      (c) => c.status === "on_track" || c.status === "in_progress" || c.status === "at_risk",
    ).length,
    pendingApprovals: cases.filter((c) => c.currentStage === 4).length,
    compensationPending: cases.filter((c) => c.currentStage === 6 || c.currentStage === 7).length,
    delayedCases: cases.filter((c) => c.status === "delayed").length,
    completedCases: cases.filter((c) => c.status === "completed").length,
  };
}

export const PRIORITY_ALERTS: PriorityAlert[] = [
  {
    id: "alert-01",
    caseNumber: "BS-2026-00124",
    riskLevel: "high",
    issue: "Compensation approval delayed",
    durationDays: 18,
    recommendedAction: "District Officer Review",
  },
  {
    id: "alert-02",
    caseNumber: "BS-2026-00107",
    riskLevel: "critical",
    issue: "Public notification pending beyond deadline",
    durationDays: 26,
    recommendedAction: "Escalate to State Officer",
  },
  {
    id: "alert-03",
    caseNumber: "BS-2026-00111",
    riskLevel: "medium",
    issue: "Verification documents incomplete",
    durationDays: 9,
    recommendedAction: "Request missing documents",
  },
];

export function districtName(districtId: string): string {
  return DISTRICTS.find((d) => d.id === districtId)?.name ?? "Unknown";
}

export function projectName(projectId: string): string {
  return PROJECTS.find((p) => p.id === projectId)?.name ?? "Unknown Project";
}

// Core domain types for BhoomiSetu.
// Kept intentionally close to the eventual PostgreSQL/PostGIS schema
// (see backend/src/database in later phases) so the mock data in
// src/data can be swapped for real API responses with minimal change.

// Mirrors the `case_status` Postgres enum. `in_progress` and `on_hold` were
// added when the spec distinguished normal progress from an explicit hold —
// omitting them here made the type reject statuses the API genuinely returns.
export type CaseStatus = "on_track" | "in_progress" | "at_risk" | "delayed" | "completed" | "on_hold";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type StageStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "delayed"
  | "blocked";

export const PIPELINE_STAGES = [
  "Land Identification",
  "Digital Land & Owner Records",
  "Acquisition Proposal",
  "Verification & Approval",
  "Public Notification",
  "Compensation Assessment",
  "Compensation Disbursement",
  "Rehabilitation & Resettlement",
  "Land Handover",
  "Real-Time Monitoring & Reports",
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGES)[number];

export interface District {
  id: string;
  name: string;
  stateName: string;
}

export interface Project {
  id: string;
  name: string;
  agency: string;
  districtId: string;
}

export interface LandParcel {
  id: string;
  ulpin: string;
  districtId: string;
  stateName: string;
  areaHectares: number;
  landUse: string;
  /** Fictional demo landowner reference — full landowner records arrive in Phase 7. */
  landownerRef: string;
  /** Approximate centroid used to place/pan the map to this parcel. */
  centroid: { lat: number; lng: number };
  /** Simple demo parcel boundary as [lat, lng] pairs (closed ring). */
  boundary: [number, number][];
}

export interface AcquisitionStage {
  stageNumber: number;
  stageName: PipelineStageName;
  status: StageStatus;
  startDate?: string;
  completionDate?: string;
  dueDate?: string;
  responsibleDepartment: string;
  responsibleOfficer: string;
  remarks?: string;
  delayDays?: number;
}

export interface AcquisitionCase {
  id: string;
  caseNumber: string;
  projectId: string;
  parcelId: string;
  districtId: string;
  currentStage: number;
  status: CaseStatus;
  riskLevel: RiskLevel;
  assignedOfficer: string;
  createdAt: string;
  updatedAt: string;
}

export interface KpiSummary {
  totalCases: number;
  activeAcquisitions: number;
  pendingApprovals: number;
  compensationPending: number;
  delayedCases: number;
  completedCases: number;
}

export interface PriorityAlert {
  id: string;
  caseNumber: string;
  riskLevel: RiskLevel;
  issue: string;
  durationDays: number;
  recommendedAction: string;
}

/**
 * Document lifecycle. The original three values are retained; the additions
 * model a full lifecycle, including `missing` (a *required* document that was
 * never uploaded, as opposed to `pending_verification`, which means "uploaded,
 * awaiting a decision").
 */
export type DocumentStatus =
  | "pending_verification"
  | "verified"
  | "rejected"
  | "uploaded"
  | "under_review"
  | "missing"
  | "expired"
  | "superseded";

// Matches the 9 document categories from the master spec (section 19).
// "Real-Time Monitoring & Reports", stage 10, has no vault category.
export const DOCUMENT_CATEGORIES = [
  "Survey Report",
  "Ownership Record",
  "Acquisition Proposal",
  "Verification Report",
  "Public Notification",
  "Compensation Assessment",
  "Payment Record",
  "R&R Documents",
  "Handover Certificate",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export interface CaseDocument {
  id: string;
  caseId: string;
  category: DocumentCategory;
  fileName: string;
  status: DocumentStatus;
  uploadedBy: string;
  uploadedAt: string;
}

export interface TimelineEntry {
  date: string;
  title: string;
  description?: string;
  isCurrent?: boolean;
}

export type UserRole =
  | "super_admin"
  | "dolr_officer"
  | "state_officer"
  | "district_officer"
  | "landowner"
  | "land_agency";

export type UserRole =
  // Original 6 roles — unchanged so existing accounts, tokens and
  // requireRole() guards keep working.
  | "super_admin"
  | "dolr_officer"
  | "state_officer"
  | "district_officer"
  | "landowner"
  | "land_agency"
  // Operational roles added alongside the original six (ADDITIVE, not a rename).
  | "state_admin"
  | "district_admin"
  | "project_officer"
  | "field_officer"
  | "compensation_officer"
  | "rr_officer"
  | "document_officer"
  | "grievance_officer"
  | "viewer";

export type CaseStatus =
  | "on_track"
  | "at_risk"
  | "delayed"
  | "completed"
  // Added to distinguish "on_track" from actively "in_progress", and to
  // represent an explicit administrative hold.
  | "in_progress"
  | "on_hold";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type StageStatus = "not_started" | "in_progress" | "completed" | "delayed" | "blocked";

/**
 * Document lifecycle. The original three values are retained; the additions
 * model a full lifecycle, including `missing` which represents a *required*
 * document that was never uploaded (as opposed to `pending_verification`,
 * which means "uploaded, awaiting a decision").
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

export type ProjectStatus = "planning" | "active" | "at_risk" | "delayed" | "completed" | "on_hold";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "completed" | "overdue";
export type TaskPriority = "low" | "medium" | "high" | "critical";

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

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  districtId?: string;
}

// AI Types
export type AIIntent =
  | "CASE_STATUS"
  | "CASE_SUMMARY"
  | "CASE_DELAY"
  | "CASE_STAGE"
  | "CASE_RISK"
  | "CASE_RECOMMENDATION"
  | "PARCEL_SEARCH"
  | "PARCEL_DETAILS"
  | "PROJECT_STATUS"
  | "COMPENSATION_STATUS"
  | "GRIEVANCE_STATUS"
  | "DOCUMENT_STATUS"
  | "NOTIFICATION_SUMMARY"
  | "DASHBOARD_SUMMARY"
  | "ANALYTICS_QUERY"
  | "REPORT_QUERY"
  | "WORKFLOW_EXPLANATION"
  | "BOTTLENECK_RESOLUTION"
  | "GENERAL_BHOOMISETU_HELP"
  | "UNKNOWN";

export interface AIContext {
  page?: string;
  caseId?: string;
  /** Human-readable case number (e.g. BS-2026-00124) for display only. */
  caseNumber?: string;
  parcelId?: string;
  ulpin?: string;
  projectId?: string;
  grievanceId?: string;
  role?: UserRole;
  message?: string;
}

export interface AIChatRequest {
  message: string;
  context?: AIContext;
  conversationHistory?: AIChatMessage[];
}

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface AISource {
  type: "case" | "stage" | "document" | "compensation" | "grievance" | "risk" | "analytics" | "notification" | "parcel" | "project";
  id: string;
  label: string;
}

export interface AISuggestedAction {
  label: string;
  type: "VIEW_CASE" | "VIEW_PARCEL" | "VIEW_STAGE" | "VIEW_COMPENSATION" | "VIEW_GRIEVANCE" | "VIEW_DOCUMENT" | "VIEW_REPORT" | "VIEW_ANALYTICS";
  targetId?: string;
}

export interface AIChatResponse {
  message: string;
  intent?: AIIntent;
  sources?: AISource[];
  contextUsed?: AIContext;
  suggestedActions?: AISuggestedAction[];
  disclaimer?: string;
}

// Augment Express's Request with the authenticated user attached by the auth middleware.
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

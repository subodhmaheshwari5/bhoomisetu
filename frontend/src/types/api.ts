import type { CaseStatus, DocumentStatus, RiskLevel, StageStatus, UserRole } from "../types";

// -----------------------------------------------------------------------
// These mirror exactly what backend/src/services/*.ts select and
// camelCase — not guessed, read from the backend source. Numeric
// Postgres columns (NUMERIC) come back as strings via node-pg, so
// amounts/areas below are typed `string` and parsed for display.
// -----------------------------------------------------------------------

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface ApiCase {
  id: string;
  caseNumber: string;
  projectId: string;
  projectName: string;
  agency: string;
  parcelId: string;
  ulpin: string;
  districtId: string;
  districtName: string;
  stateName: string;
  currentStage: number;
  status: CaseStatus;
  riskLevel: RiskLevel;
  assignedOfficer: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiStage {
  id: string;
  caseId: string;
  stageNumber: number;
  stageName: string;
  status: StageStatus;
  startDate: string | null;
  completionDate: string | null;
  dueDate: string | null;
  responsibleDepartment: string;
  responsibleOfficer: string;
  remarks: string | null;
  delayDays: number | null;
}

export interface ApiDocument {
  id: string;
  caseId: string;
  category: string;
  fileName: string;
  storagePath: string;
  uploadedBy: string;
  status: DocumentStatus;
  uploadedAt: string;
}

// A row in the cross-case document register (GET /api/documents). Superset of
// ApiDocument: the register joins the owning case and counts versions so the
// list can render case context and "v3" without a request per row.
// A Rehabilitation & Resettlement record (GET /api/rehabilitation). One row per
// affected parcel. `status` is a closed TEXT set on the backend rather than a
// Postgres enum, so it is declared as a string union here to match. It must
// stay in step with REHABILITATION_STATUSES and the
// `rehabilitation_status_check` constraint.
//
// `in_progress` means the R&R process has started but is not yet completed. It
// is an active/in-flight state, distinct from both `completed` and `not_started`.
export type RehabilitationStatus =
  | "not_started"
  | "in_progress"
  | "eligibility_pending"
  | "eligible"
  | "entitlement_pending"
  | "entitlement_approved"
  | "assistance_pending"
  | "assistance_provided"
  | "resettlement_pending"
  | "resettled"
  | "completed"
  | "disputed";

export interface ApiRehabilitationRecord {
  id: string;
  caseId: string;
  caseNumber: string;
  currentStage: number;
  caseStatus: string;
  parcelId: string | null;
  ulpin: string | null;
  districtName: string;
  affectedFamily: string | null;
  eligibility: string | null;
  entitlement: string | null;
  assistance: string | null;
  housing: string | null;
  livelihood: string | null;
  resettlement: string | null;
  status: RehabilitationStatus;
  details: string | null;
  targetDate: string | null;
  updatedAt: string;
}

export interface ApiRehabilitationSummary {
  total: number;
  completed: number;
  notStarted: number;
  /** Records sitting in the explicit `in_progress` state. */
  inProgress: number;
  disputed: number;
  /** Active work: neither terminal nor untouched. Includes `in_progress`. */
  inFlight: number;
  completionRate: number;
  byStatus: { status: RehabilitationStatus; count: number }[];
}

export interface ApiRehabilitationStatusOption {
  value: RehabilitationStatus;
  label: string;
}

export interface ApiDocumentRegisterRow extends ApiDocument {
  documentRef: string | null;
  caseNumber: string;
  districtName: string;
  currentVersion: number;
  versionCount: number;
}

export interface ApiDocumentCategory {
  category: string;
  count: number;
}

export interface ApiParcel {
  id: string;
  ulpin: string;
  districtId: string;
  districtName: string;
  stateName: string;
  areaHectares: string;
  landUse: string;
  landownerRef: string | null;
  centroid: { type: "Point"; coordinates: [number, number] };
  boundary: { type: "Polygon"; coordinates: [number, number][][] };
  createdAt: string;
  updatedAt: string;
}

export interface ApiProject {
  id: string;
  name: string;
  agency: string;
  districtId: string;
  districtName: string;
  stateName: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Administration (GET /api/admin/*)
// ---------------------------------------------------------------------------

export interface ApiAdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Null for roles that are not district-scoped. */
  districtId: string | null;
  districtName: string | null;
  createdAt: string;
}

export interface ApiAdminState {
  id: string;
  name: string;
  code: string;
  region: string | null;
  status: string;
  districtCount: number;
  createdAt: string;
}

export interface ApiAdminDistrict {
  id: string;
  name: string;
  stateName: string;
  state: string | null;
  code: string | null;
  isActive: boolean;
  stateId: string | null;
  caseCount: number;
  projectCount: number;
}

export interface ApiSystemSetting {
  key: string;
  /**
   * The setting's value, or a mask when `isSecret` is true. The backend never
   * sends the real value of a secret, so the client cannot display one.
   */
  value: unknown;
  category: string;
  description: string | null;
  isSecret: boolean;
  updatedAt: string;
  updatedByName: string | null;
}

export interface ApiAuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  createdAt: string;
  userName: string | null;
  userRole: UserRole | null;
}

export interface ApiAuditLogPage {
  total: number;
  limit: number;
  offset: number;
  entries: ApiAuditLogEntry[];
}

export interface ApiAuditFacet {
  kind: "entity" | "action";
  value: string;
  count: number;
}

export interface ApiKpiSummary {
  totalCases: number;
  activeAcquisitions: number;
  pendingApprovals: number;
  compensationPending: number;
  delayedCases: number;
  completedCases: number;
}

export interface ApiPriorityAlert {
  caseId: string;
  caseNumber: string;
  riskLevel: RiskLevel;
  issue: string;
  durationDays: number;
  recommendedAction: string;
}

export interface ApiDashboard {
  kpi: ApiKpiSummary;
  priorityAlerts: ApiPriorityAlert[];
}

export interface ApiStageDistributionPoint {
  stageNumber: number;
  stageName: string;
  count: number;
}

export interface ApiDistrictPerformancePoint {
  district: string;
  cases: number;
}

export interface ApiCaseStatusPoint {
  status: CaseStatus;
  count: number;
}

export interface ApiBottleneckPoint {
  stageName: string;
  delayedCount: number;
  averageDelayDays: number;
}

export interface ApiAnalytics {
  stageDistribution: ApiStageDistributionPoint[];
  districtPerformance: ApiDistrictPerformancePoint[];
  caseStatus: ApiCaseStatusPoint[];
  bottlenecks: ApiBottleneckPoint[];
}

export interface ApiRiskScore {
  caseId: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
  recommendation: string;
  computedAt: string;
  disclaimer: string;
}

export interface ApiCompensation {
  id: string;
  caseId: string;
  caseNumber: string;
  assessmentAmount: string | null;
  approvalStatus: string;
  disbursementStatus: string;
  paymentDate: string | null;
  paymentReference: string | null;
  updatedAt: string;
}

/**
 * Grievance lifecycle. The original five values are retained so existing
 * records and filters keep working; `open` and `escalated` are added for the
 * fuller operational lifecycle used by the demo dataset.
 */
export type GrievanceStatus =
  | "submitted"
  | "under_review"
  | "assigned"
  | "resolved"
  | "rejected"
  | "open"
  | "escalated";

export interface ApiGrievance {
  id: string;
  grievanceNumber: string;
  caseId: string | null;
  caseNumber: string | null;
  landownerId: string | null;
  category: string;
  description: string;
  status: GrievanceStatus;
  assignedOfficer: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiAlertScanResult {
  deadlineExceeded: number;
  deadlineApproaching: number;
  highRiskCases: number;
  notificationsCreated: number;
  scannedAt: string;
}

export interface ApiNotification {
  id: string;
  caseId: string | null;
  caseNumber: string | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
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
  intent?: string;
  sources?: AISource[];
  contextUsed?: {
    caseId?: string;
    parcelId?: string;
    ulpin?: string;
    projectId?: string;
    grievanceId?: string;
    role?: string;
  };
  suggestedActions?: AISuggestedAction[];
  disclaimer?: string;
}

export interface AIChatRequest {
  message: string;
  context?: {
    page?: string;
    caseId?: string;
    caseNumber?: string;
    parcelId?: string;
    ulpin?: string;
    projectId?: string;
    grievanceId?: string;
    role?: string;
  };
  conversationHistory?: { role: "user" | "assistant"; content: string; timestamp?: string }[];
}

export interface AISuggestedPrompt {
  label: string;
  prompt: string;
}

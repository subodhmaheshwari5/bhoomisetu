/** Frontend mirror of the backend Acquisition Intelligence contract. */

export type BottleneckCategory =
  | "document_blocker"
  | "approval_blocker"
  | "compensation_blocker"
  | "r_and_r_blocker"
  | "legal_blocker"
  | "grievance_blocker"
  | "survey_blocker"
  | "data_quality_blocker"
  | "dependency_blocker"
  | "department_handoff_blocker"
  | "deadline_blocker"
  | "ownership_verification_blocker"
  | "payment_blocker"
  | "gis_parcel_blocker"
  | "unknown_blocker";

export type BottleneckSeverity = "critical" | "high" | "medium" | "low";
export type BottleneckConfidence = "high" | "medium" | "low";

export interface EvidenceItem {
  id: string;
  source: string;
  field: string;
  observed: string;
  supports: string;
}

export interface IntelligenceRecommendation {
  action: string;
  reason: string;
  responsibleRole: string;
  dependency: string | null;
  priority: "high" | "medium" | "low";
  evidenceIds: string[];
}

export interface Bottleneck {
  type: BottleneckCategory;
  title: string;
  detail: string;
  severity: BottleneckSeverity;
  confidence: BottleneckConfidence;
  evidenceIds: string[];
  delayContributionDays?: number;
  affectedStages?: number[];
}

export interface DependencyChainNode {
  stageNumber: number;
  stageName: string;
  status: string;
  isCurrentBlocker: boolean;
  isPrimary: boolean;
}

/**
 * A live obligation that is not necessarily holding the case up.
 *
 * Mirrors the backend contract: `blocking: false` means work is under way with
 * no evidence of delay, and must not be presented as a bottleneck.
 */
export interface ActiveDependency {
  category: BottleneckCategory;
  classification: "active_dependency" | "blocker";
  title: string;
  reason: string;
  severity: "info" | BottleneckSeverity;
  blocking: boolean;
  evidenceIds: string[];
}

export interface VerifiedPrecedent {
  resolutionId: string;
  sourceCaseId: string;
  sourceCaseNumber: string;
  problemType: string;
  stageNumber: number | null;
  problemDescription: string;
  resolution: string;
  actionsTaken: string;
  responsibleDepartment: string;
  outcome: string;
  resolutionDate: string;
  verifiedAt: string;
  verifiedByName: string;
  match: { level: "high" | "moderate" | "low"; matchedOn: string[] };
}

export interface CaseIntelligence {
  analysisVersion: string;
  caseId: string;
  caseNumber: string;
  projectName: string | null;
  projectAgency: string | null;
  districtName: string | null;
  ulpin: string | null;
  status: string;
  currentStage: number;
  currentStageName: string;

  summary: string;
  primaryBlocker: Bottleneck | null;
  contributingFactors: Bottleneck[];
  allBlockers: Bottleneck[];
  /**
   * Present on responses from analysis versions that distinguish work in
   * progress from work that is blocking. Older payloads omit the field, so it
   * must be treated as possibly undefined.
   */
  activeDependencies?: ActiveDependency[];
  evidence: EvidenceItem[];
  dependencyChain: DependencyChainNode[];

  delayImpact: { delayDays: number; recordedStageDelayDays: number; affectedStages: number[] };

  risk: {
    score: number | null;
    level: string;
    reasons: string[];
    recommendation: string | null;
    source: "computed" | "case_field";
  };
  riskDisagreement: {
    caseFieldLevel: string;
    computedLevel: string;
    computedScore: number;
    note: string;
  } | null;

  recommendations: IntelligenceRecommendation[];
  dataCompleteness: { isComplete: boolean; missingSections: string[] };
  disclaimer: string;
  similarCases?: VerifiedPrecedent[];
}

export type ResolutionStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "verified"
  | "rejected"
  | "archived";

export interface CaseResolution {
  id: string;
  caseId: string;
  caseNumber: string;
  problemType: string;
  stageNumber: number | null;
  problemDescription: string;
  rootCause: string;
  actionTaken: string;
  responsibleDepartment: string;
  resolution: string;
  outcome: string;
  resolutionDate: string;
  supportingDocumentRefs: string[];
  status: ResolutionStatus;
  recordedBy: string;
  recordedByName: string;
  verifiedBy: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  analysisVersion: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Types for the Acquisition Intelligence Engine.
 *
 * Kept separate from `types/index.ts` (which holds the existing AI chat types)
 * so the intelligence contract is legible on its own and can be versioned
 * independently via ANALYSIS_VERSION.
 */

export const BOTTLENECK_CATEGORIES = [
  "document_blocker",
  "approval_blocker",
  "compensation_blocker",
  "r_and_r_blocker",
  "legal_blocker",
  "grievance_blocker",
  "survey_blocker",
  "data_quality_blocker",
  "dependency_blocker",
  "department_handoff_blocker",
  "deadline_blocker",
  "ownership_verification_blocker",
  "payment_blocker",
  "gis_parcel_blocker",
  "unknown_blocker",
] as const;

export type BottleneckCategory = (typeof BOTTLENECK_CATEGORIES)[number];

export type BottleneckSeverity = "critical" | "high" | "medium" | "low";

/**
 * Confidence describes how strongly the AVAILABLE EVIDENCE supports the
 * classification — not how confident a model feels. No numeric probability is
 * exposed anywhere in this contract.
 */
export type BottleneckConfidence = "high" | "medium" | "low";

export type EvidenceSource =
  | "acquisition_case"
  | "acquisition_stage"
  | "document"
  | "compensation"
  | "rehabilitation"
  | "grievance"
  | "risk_score"
  | "land_parcel"
  | "project"
  | "district"
  | "task";

export interface EvidenceItem {
  /** Stable within one analysis, e.g. "E1". Referenced by blocker.evidenceIds. */
  id: string;
  source: EvidenceSource;
  /** The exact column or field the observation came from. */
  field: string;
  observed: string;
  /** Why this observation matters. */
  supports: string;
}

export interface IntelligenceRecommendation {
  action: string;
  reason: string;
  /**
   * A role or department, never a named individual. The engine reports where
   * accountability sits; it does not apportion blame to a person.
   */
  responsibleRole: string;
  dependency: string | null;
  priority: "high" | "medium" | "low";
  /** IDs of the evidence items that justify this recommendation. */
  evidenceIds: string[];
}

export interface Bottleneck {
  type: BottleneckCategory;
  title: string;
  detail: string;
  severity: BottleneckSeverity;
  confidence: BottleneckConfidence;
  evidenceIds: string[];
}

/**
 * How far along an obligation is, independent of whether it is blocking.
 *
 * `active_dependency` means work is genuinely under way but nothing shows it is
 * holding the case up. `blocker` means the evidence shows it IS preventing
 * progress. The distinction matters because "not finished" is not the same claim
 * as "stopping the case", and conflating them makes a live process look stalled.
 */
export type ActiveDependencyClassification = "active_dependency" | "blocker";

/**
 * `info` is deliberately outside BottleneckSeverity: an informational item must
 * never be able to compete for primary-blocker ranking, so it is not typed as a
 * severity at all.
 */
export type ActiveDependencySeverity = "info" | BottleneckSeverity;

export interface ActiveDependency {
  category: BottleneckCategory;
  classification: ActiveDependencyClassification;
  title: string;
  reason: string;
  severity: ActiveDependencySeverity;
  /** True only when the evidence shows this is actually preventing progress. */
  blocking: boolean;
  evidenceIds: string[];
}

export interface DependencyChainNode {
  stageNumber: number;
  stageName: string;
  status: string;
  /** True for every stage the primary blocker gates. */
  isCurrentBlocker: boolean;
  /** True only for the first node — where the blockage begins. */
  isPrimary: boolean;
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

  /** Deterministic executive summary assembled from evidence fields. */
  summary: string;

  primaryBlocker: Bottleneck | null;
  contributingFactors: Bottleneck[];
  /** Every detected blocker, ranked. Includes the primary. */
  allBlockers: Array<
    Bottleneck & {
      delayContributionDays: number;
      affectedStages: number[];
    }
  >;

  /**
   * Obligations that are live but not necessarily blocking — R&R in progress is
   * the canonical example.
   *
   * Deliberately kept out of `allBlockers` so an active dependency can never be
   * promoted to primary blocker or influence the risk score. An entry with
   * `blocking: true` is a genuine blocker and is ALSO present in `allBlockers`;
   * an entry with `blocking: false` appears only here.
   */
  activeDependencies: ActiveDependency[];

  evidence: EvidenceItem[];
  dependencyChain: DependencyChainNode[];

  delayImpact: {
    delayDays: number;
    recordedStageDelayDays: number;
    affectedStages: number[];
  };

  risk: {
    score: number | null;
    level: string;
    reasons: string[];
    recommendation: string | null;
    /**
     * "computed" = the deterministic risk engine ran for this case.
     * "case_field" = only the officer-set risk_level column was available.
     */
    source: "computed" | "case_field";
  };

  /**
   * Present when the officer-set risk_level and the computed score disagree.
   * Both are surfaced; neither is silently overwritten.
   */
  riskDisagreement: {
    caseFieldLevel: string;
    computedLevel: string;
    computedScore: number;
    note: string;
  } | null;

  recommendations: IntelligenceRecommendation[];
  dataCompleteness: { isComplete: boolean; missingSections: string[] };

  disclaimer: string;
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
  /**
   * Match strength derived from structured attributes only (problem type, stage,
   * project). Deliberately categorical — no fabricated similarity percentage.
   */
  match: {
    level: "high" | "moderate" | "low";
    matchedOn: string[];
  };
}

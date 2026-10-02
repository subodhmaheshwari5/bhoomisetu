// -----------------------------------------------------------------------
// CASE WORKFLOW DATA — BhoomiSetu prototype
//
// Generates the 10-stage pipeline, document vault, and timeline for every
// acquisition case from the case's own fields (currentStage, status,
// createdAt, assignedOfficer) rather than hand-authoring each one. This
// keeps every case internally consistent and makes it straightforward to
// swap in real per-stage records from an API later — callers only ever
// go through getCaseWorkflow(caseId).
// -----------------------------------------------------------------------

import type {
  AcquisitionCase,
  AcquisitionStage,
  CaseDocument,
  DocumentStatus,
  StageStatus,
  TimelineEntry,
} from "../types";
import { DOCUMENT_CATEGORIES, PIPELINE_STAGES } from "../types";
import { CASES, FLAGSHIP_CASE } from "./demoData";

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
] as const;

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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

/** Builds the full 10-stage pipeline for a single case from its summary fields. */
export function buildStagesForCase(acquisitionCase: AcquisitionCase): AcquisitionStage[] {
  const { currentStage, status, createdAt, assignedOfficer } = acquisitionCase;
  const isComplete = status === "completed";

  return PIPELINE_STAGES.map((stageName, index) => {
    const stageNumber = index + 1;
    const startDate = addDays(createdAt, stageNumber === 1 ? 0 : (stageNumber - 1) * 9);

    let stageStatus: StageStatus;
    if (isComplete || stageNumber < currentStage) {
      stageStatus = "completed";
    } else if (stageNumber > currentStage) {
      stageStatus = "not_started";
    } else {
      // This is the case's current stage.
      stageStatus = status === "delayed" ? "delayed" : "in_progress";
    }

    const completionDate = stageStatus === "completed" ? addDays(startDate, 7) : undefined;
    const dueDate = stageStatus === "not_started" ? undefined : addDays(startDate, 10);
    const isFlagshipDelay = acquisitionCase.id === FLAGSHIP_CASE.id && stageStatus === "delayed";
    const delayDays =
      stageStatus === "delayed" ? (isFlagshipDelay ? 18 : 4 + ((stageNumber * 3) % 11)) : undefined;

    return {
      stageNumber,
      stageName,
      status: stageStatus,
      startDate: stageStatus === "not_started" ? undefined : startDate,
      completionDate,
      dueDate,
      responsibleDepartment: STAGE_DEPARTMENTS[index],
      responsibleOfficer: assignedOfficer,
      remarks: stageStatus === "not_started" ? undefined : stageStatusRemark(stageStatus, stageName),
      delayDays,
    };
  });
}

function documentStatusForStage(stageStatus: StageStatus): DocumentStatus | null {
  if (stageStatus === "completed") return "verified";
  if (stageStatus === "in_progress" || stageStatus === "delayed") return "pending_verification";
  return null;
}

/** Builds the document vault for a case from its generated stages (stages 1–9 only). */
export function buildDocumentsForCase(
  acquisitionCase: AcquisitionCase,
  stages: AcquisitionStage[],
): CaseDocument[] {
  const documents: CaseDocument[] = [];

  DOCUMENT_CATEGORIES.forEach((category, index) => {
    const stage = stages[index]; // categories map 1:1 to stages 1–9
    const docStatus = documentStatusForStage(stage.status);
    if (!docStatus) return;

    documents.push({
      id: `${acquisitionCase.id}-doc-${index + 1}`,
      caseId: acquisitionCase.id,
      category,
      fileName: `${category.replace(/[^a-zA-Z0-9]+/g, "_")}_${acquisitionCase.caseNumber}.pdf`,
      status: docStatus,
      uploadedBy: acquisitionCase.assignedOfficer,
      uploadedAt: stage.completionDate ?? stage.startDate ?? acquisitionCase.createdAt,
    });
  });

  return documents;
}

/** A chronological view of a case's progress, derived from its stages. */
export function buildTimelineForCase(
  acquisitionCase: AcquisitionCase,
  stages: AcquisitionStage[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { date: acquisitionCase.createdAt, title: "Case created", description: `Case ${acquisitionCase.caseNumber} opened.` },
  ];

  for (const stage of stages) {
    if (stage.status === "not_started") continue;

    if (stage.status === "completed" && stage.completionDate) {
      entries.push({ date: stage.completionDate, title: `${stage.stageName} completed` });
    } else if (stage.startDate) {
      const isCurrent = stage.status === "in_progress" || stage.status === "delayed";
      entries.push({
        date: stage.startDate,
        title:
          stage.status === "delayed"
            ? `${stage.stageName} — deadline exceeded`
            : `${stage.stageName} started`,
        description: isCurrent ? stage.remarks : undefined,
        isCurrent,
      });
    }
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

export interface CaseWorkflow {
  case: AcquisitionCase;
  stages: AcquisitionStage[];
  documents: CaseDocument[];
  timeline: TimelineEntry[];
}

const WORKFLOW_CACHE = new Map<string, CaseWorkflow>();

/** The single entry point for the case detail page: stages, documents and timeline, memoized per case. */
export function getCaseWorkflow(caseId: string, cases: AcquisitionCase[] = CASES): CaseWorkflow | undefined {
  if (WORKFLOW_CACHE.has(caseId)) return WORKFLOW_CACHE.get(caseId);

  const acquisitionCase = cases.find((c) => c.id === caseId);
  if (!acquisitionCase) return undefined;

  const stages = buildStagesForCase(acquisitionCase);
  const documents = buildDocumentsForCase(acquisitionCase, stages);
  const timeline = buildTimelineForCase(acquisitionCase, stages);

  const workflow: CaseWorkflow = { case: acquisitionCase, stages, documents, timeline };
  WORKFLOW_CACHE.set(caseId, workflow);
  return workflow;
}

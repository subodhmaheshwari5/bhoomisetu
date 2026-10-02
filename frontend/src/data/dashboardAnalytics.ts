// -----------------------------------------------------------------------
// DASHBOARD ANALYTICS DATA — BhoomiSetu prototype
//
// These are derived/aggregated views over the entities in `demoData.ts`
// (cases, districts, pipeline stages) purely for chart consumption.
// Nothing here is hard-coded per-chart: every function takes the case
// list as a parameter (defaulting to the current demo CASES) so a future
// API response can be passed in without changing the chart components.
// -----------------------------------------------------------------------

import type { AcquisitionCase, CaseStatus } from "../types";
import { PIPELINE_STAGES } from "../types";
import { CASES, DISTRICTS } from "./demoData";

export interface StageDistributionPoint {
  stageNumber: number;
  stageName: string;
  count: number;
}

export interface DistrictPerformancePoint {
  districtId: string;
  district: string;
  cases: number;
}

export interface CaseStatusPoint {
  status: CaseStatus;
  label: string;
  count: number;
}

/** Cases grouped by their current pipeline stage (1–10). */
export function getStageDistribution(cases: AcquisitionCase[] = CASES): StageDistributionPoint[] {
  return PIPELINE_STAGES.map((stageName, index) => {
    const stageNumber = index + 1;
    return {
      stageNumber,
      stageName,
      count: cases.filter((c) => c.currentStage === stageNumber).length,
    };
  }).filter((point) => point.count > 0);
}

/** Case counts grouped by district, sorted busiest-first. */
export function getDistrictPerformance(cases: AcquisitionCase[] = CASES): DistrictPerformancePoint[] {
  return DISTRICTS.map((district) => ({
    districtId: district.id,
    district: district.name,
    cases: cases.filter((c) => c.districtId === district.id).length,
  })).sort((a, b) => b.cases - a.cases);
}

// Kept in step with the backend's `case_status` enum so the mock fallback
// shows the same buckets the real analytics endpoint does.
const CASE_STATUS_ORDER: { status: CaseStatus; label: string }[] = [
  { status: "completed", label: "Completed" },
  { status: "on_track", label: "On Track" },
  { status: "in_progress", label: "In Progress" },
  { status: "at_risk", label: "At Risk" },
  { status: "delayed", label: "Delayed" },
  { status: "on_hold", label: "On Hold" },
];

/** Case counts grouped by overall case status. */
export function getCaseStatusBreakdown(cases: AcquisitionCase[] = CASES): CaseStatusPoint[] {
  return CASE_STATUS_ORDER.map(({ status, label }) => ({
    status,
    label,
    count: cases.filter((c) => c.status === status).length,
  }));
}

// -----------------------------------------------------------------------
// GIS DATA HELPERS — BhoomiSetu
//
// Pure selectors over live API data (ApiParcel[]/ApiCase[] from GET
// /api/parcels and GET /api/cases) for the Land Map page. No local demo
// data — every array is passed in by the caller after fetching it.
// -----------------------------------------------------------------------

import type { CaseStatus } from "../types";
import type { ApiCase, ApiParcel } from "../types/api";

export type ParcelMapStatus = "completed" | "active" | "at_risk" | "delayed" | "on_hold" | "unassigned";

const CASE_STATUS_TO_MAP_STATUS: Record<CaseStatus, ParcelMapStatus> = {
  completed: "completed",
  on_track: "active",
  // Ordinary progress is active work, same as on_track.
  in_progress: "active",
  at_risk: "at_risk",
  delayed: "delayed",
  // A held case is deliberately paused. It gets its own map status rather than
  // being folded into `at_risk` (which would report it as genuinely risky) or
  // `unassigned` (which means "no case exists here").
  on_hold: "on_hold",
};

// Section 14 of the brief: green = completed, blue = active, yellow = at
// risk, red = delayed. Parcels with no linked case yet render neutral gray.
export const PARCEL_STATUS_COLORS: Record<ParcelMapStatus, { fill: string; label: string }> = {
  completed: { fill: "var(--color-success)", label: "Completed" },
  active: { fill: "var(--color-info)", label: "Active" },
  at_risk: { fill: "var(--color-warning)", label: "At Risk" },
  delayed: { fill: "var(--color-danger)", label: "Delayed" },
  on_hold: { fill: "var(--color-navy-500)", label: "On Hold" },
  unassigned: { fill: "var(--color-neutral)", label: "Unassigned" },
};

/** The most relevant acquisition case for a parcel, if one exists. */
export function caseForParcel(parcelId: string, cases: ApiCase[]): ApiCase | undefined {
  return cases.find((c) => c.parcelId === parcelId);
}

export function parcelMapStatus(parcelId: string, cases: ApiCase[]): ParcelMapStatus {
  const linkedCase = caseForParcel(parcelId, cases);
  return linkedCase ? CASE_STATUS_TO_MAP_STATUS[linkedCase.status] : "unassigned";
}

export interface ParcelSearchResult {
  parcel: ApiParcel;
  matchedOn: "ulpin" | "caseNumber" | "project" | "district";
}

/** Client-side filter over already-loaded parcels, by ULPIN, linked Case ID, project name, or district name. */
export function searchParcels(query: string, parcels: ApiParcel[], cases: ApiCase[]): ParcelSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return parcels.map((parcel) => ({ parcel, matchedOn: "ulpin" as const }));

  const results: ParcelSearchResult[] = [];
  for (const parcel of parcels) {
    if (parcel.ulpin.toLowerCase().includes(q)) {
      results.push({ parcel, matchedOn: "ulpin" });
      continue;
    }
    const linkedCase = caseForParcel(parcel.id, cases);
    if (linkedCase && linkedCase.caseNumber.toLowerCase().includes(q)) {
      results.push({ parcel, matchedOn: "caseNumber" });
      continue;
    }
    if (linkedCase && linkedCase.projectName.toLowerCase().includes(q)) {
      results.push({ parcel, matchedOn: "project" });
      continue;
    }
    if (parcel.districtName.toLowerCase().includes(q)) {
      results.push({ parcel, matchedOn: "district" });
    }
  }
  return results;
}

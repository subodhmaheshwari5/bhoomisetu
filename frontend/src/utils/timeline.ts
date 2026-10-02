import type { TimelineEntry } from "../types";
import type { ApiCase, ApiStage } from "../types/api";

/** Mirrors the shape the old local demo generator produced, now driven by real API data. */
export function buildTimeline(acquisitionCase: ApiCase, stages: ApiStage[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      date: acquisitionCase.createdAt.slice(0, 10),
      title: "Case created",
      description: `Case ${acquisitionCase.caseNumber} opened.`,
    },
  ];

  for (const stage of stages) {
    if (stage.status === "not_started") continue;

    if (stage.status === "completed" && stage.completionDate) {
      entries.push({ date: stage.completionDate.slice(0, 10), title: `${stage.stageName} completed` });
    } else if (stage.startDate) {
      const isCurrent = stage.status === "in_progress" || stage.status === "delayed";
      entries.push({
        date: stage.startDate.slice(0, 10),
        title: stage.status === "delayed" ? `${stage.stageName} — deadline exceeded` : `${stage.stageName} started`,
        description: isCurrent ? (stage.remarks ?? undefined) : undefined,
        isCurrent,
      });
    }
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

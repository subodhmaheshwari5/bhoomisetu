import { Check, Circle, Dot } from "lucide-react";
import type { ApiCase } from "../../types/api";

const CHECKLIST_ITEMS = [
  { label: "Land Verification", atStage: 2 },
  { label: "Proposal", atStage: 3 },
  { label: "Approval", atStage: 4 },
  { label: "Notification", atStage: 5 },
  { label: "Compensation Assessment", atStage: 6 },
  { label: "Compensation Payment", atStage: 7 },
  { label: "Rehabilitation", atStage: 8 },
  { label: "Handover", atStage: 9 },
] as const;

type ItemState = "done" | "current" | "pending";

function stateFor(acquisitionCase: ApiCase, atStage: number): ItemState {
  if (acquisitionCase.status === "completed") return "done";
  if (acquisitionCase.currentStage > atStage) return "done";
  if (acquisitionCase.currentStage === atStage) return "current";
  return "pending";
}

export function CaseProgressChecklist({ acquisitionCase }: { acquisitionCase: ApiCase }) {
  return (
    <ol className="space-y-2">
      {CHECKLIST_ITEMS.map((item) => {
        const state = stateFor(acquisitionCase, item.atStage);
        return (
          <li key={item.label} className="flex items-center gap-3">
            {state === "done" && (
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success text-white">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            )}
            {state === "current" && (
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-gold-500 bg-gold-50">
                <Dot className="h-4 w-4 text-gold-600" strokeWidth={4} />
              </span>
            )}
            {state === "pending" && (
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-hairline text-slate">
                <Circle className="h-2 w-2 fill-current" strokeWidth={0} />
              </span>
            )}
            <span
              className={
                state === "done"
                  ? "text-sm text-ink-soft line-through decoration-success/40"
                  : state === "current"
                    ? "text-sm font-medium text-navy-950"
                    : "text-sm text-slate"
              }
            >
              {item.label}
              {state === "current" && acquisitionCase.status === "delayed" && (
                <span className="ml-2 text-xs font-medium text-danger">(delayed)</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

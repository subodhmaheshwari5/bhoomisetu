import { useState } from "react";
import { AlertOctagon, Check, RefreshCw } from "lucide-react";
import type { ApiRiskScore } from "../../types/api";
import { RiskBadge } from "../ui/StatusBadge";

const LEVEL_RING: Record<ApiRiskScore["level"], string> = {
  low: "border-success",
  medium: "border-warning",
  high: "border-danger",
  critical: "border-danger",
};

export function RiskScorePanel({
  riskScore,
  onRecompute,
  recomputing,
}: {
  riskScore: ApiRiskScore;
  onRecompute: () => void;
  recomputing?: boolean;
}) {
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  return (
    <section className="border border-hairline bg-white" aria-labelledby="risk-score-heading">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h2 id="risk-score-heading" className="flex items-center gap-2 font-display text-lg text-navy-950">
          <AlertOctagon className="h-4 w-4 text-navy-700" strokeWidth={1.75} aria-hidden="true" />
          Decision Support — Risk Score
        </h2>
        <button
          type="button"
          onClick={onRecompute}
          disabled={recomputing}
          className="flex items-center gap-1.5 border border-hairline px-3 py-1.5 text-xs font-medium text-navy-900 hover:bg-paper-dim disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${recomputing ? "animate-spin" : ""}`} strokeWidth={1.75} />
          Recompute
        </button>
      </div>

      <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-start">
        <div
          className={`grid h-24 w-24 shrink-0 place-items-center rounded-full border-4 ${LEVEL_RING[riskScore.level]}`}
        >
          <div className="text-center">
            <p className="font-mono text-2xl font-medium text-navy-950">{riskScore.score}</p>
            <p className="text-[10px] text-slate">/ 100</p>
          </div>
        </div>

        <div className="flex-1">
          <RiskBadge risk={riskScore.level} />

          <p className="mt-3 font-mono text-[11px] tracking-wide text-slate">Reasons</p>
          <ul className="mt-1.5 space-y-1.5">
            {riskScore.reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-soft">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-700" strokeWidth={2} />
                {reason}
              </li>
            ))}
          </ul>

          <p className="mt-3 font-mono text-[11px] tracking-wide text-slate">Recommendation</p>
          <p className="mt-1 text-sm font-medium text-navy-950">{riskScore.recommendation}</p>
        </div>
      </div>

      <div className="border-t border-hairline px-5 py-3">
        <button
          type="button"
          onClick={() => setShowDisclaimer((v) => !v)}
          className="text-xs text-slate underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          {showDisclaimer ? "Hide" : "What is this score?"}
        </button>
        {showDisclaimer && <p className="mt-2 text-xs text-slate">{riskScore.disclaimer}</p>}
      </div>
    </section>
  );
}

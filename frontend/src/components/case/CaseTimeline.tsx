import { History } from "lucide-react";
import type { TimelineEntry } from "../../types";

export function CaseTimeline({ timeline }: { timeline: TimelineEntry[] }) {
  return (
    <section id="timeline" className="scroll-mt-6 border border-hairline bg-white" aria-labelledby="timeline-heading">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h2 id="timeline-heading" className="flex items-center gap-2 font-display text-lg text-navy-950">
          <History className="h-4 w-4 text-navy-700" strokeWidth={1.75} aria-hidden="true" />
          Case Timeline
        </h2>
      </div>

      <ol className="px-5 py-5">
        {timeline.map((entry, index) => (
          <li key={`${entry.date}-${index}`} className="relative flex gap-4 pb-6 last:pb-0">
            {index < timeline.length - 1 && (
              <span className="absolute left-[5px] top-3 h-full w-px bg-hairline" aria-hidden="true" />
            )}
            <span
              className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 ${
                entry.isCurrent
                  ? "border-gold-500 bg-gold-400"
                  : "border-navy-700 bg-white"
              }`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] text-slate">{entry.date}</p>
              <p className={`text-sm ${entry.isCurrent ? "font-medium text-navy-950" : "text-ink"}`}>
                {entry.title}
              </p>
              {entry.description && <p className="mt-0.5 text-xs text-ink-soft">{entry.description}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

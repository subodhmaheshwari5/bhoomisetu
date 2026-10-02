import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PIPELINE_STAGES } from "../../types";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-hairline bg-navy-950 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]">
        <svg width="100%" height="100%" aria-hidden="true">
          <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
            <path d="M 42 0 L 0 0 0 42" fill="none" stroke="white" strokeWidth="1" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative mx-auto max-w-(--container-content) px-5 py-20 sm:px-8 sm:py-28">
        <div className="max-w-3xl">
          <p className="font-mono text-xs tracking-wide text-gold-400">
            SIH 2026 · PS ID 26016 · Ministry of Rural Development / DoLR
          </p>
          <h1 className="mt-6 font-display text-4xl leading-[1.08] text-white sm:text-6xl">
            One nation. One acquisition pipeline.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-navy-100/80 sm:text-lg">
            Track every land acquisition case from proposal to handover with
            unified GIS, workflow monitoring, compensation tracking and
            decision support.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a
              href="#solution"
              className="inline-flex items-center justify-center gap-2 bg-gold-400 px-6 py-3 text-sm font-medium text-navy-950 transition-colors hover:bg-gold-500"
            >
              Explore Platform
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </a>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 border border-white/25 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              Government Login
            </Link>
            <Link
              to="/landowner"
              className="inline-flex items-center justify-center gap-2 border border-white/25 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              Landowner Portal
            </Link>
          </div>
        </div>

        <div className="mt-16 flex flex-wrap items-center gap-x-2 gap-y-3 border-t border-white/10 pt-8">
          {PIPELINE_STAGES.map((stage, i) => (
            <span key={stage} className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-navy-100/60">
                {String(i + 1).padStart(2, "0")} {stage}
              </span>
              {i < PIPELINE_STAGES.length - 1 && (
                <span className="text-navy-100/30" aria-hidden="true">
                  →
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

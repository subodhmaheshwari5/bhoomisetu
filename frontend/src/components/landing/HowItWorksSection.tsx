import { PIPELINE_STAGES } from "../../types";

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-b border-hairline bg-paper">
      <div className="mx-auto max-w-(--container-content) px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <p className="font-mono text-xs tracking-wide text-navy-600">How it works</p>
          <h2 className="mt-3 font-display text-3xl leading-tight text-navy-950 sm:text-4xl">
            One case, ten stages, tracked end to end
          </h2>
          <p className="mt-4 text-ink-soft leading-relaxed">
            Every acquisition case moves through the same ten stages,
            regardless of state, district or project type — so progress is
            always comparable.
          </p>
        </div>

        <ol className="mt-12 grid grid-cols-1 gap-x-8 border-b border-hairline sm:grid-cols-2">
          {PIPELINE_STAGES.map((stage, i) => (
            <li key={stage} className="flex items-baseline gap-4 border-t border-hairline py-4">
              <span className="font-mono text-sm text-gold-600">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-navy-950">{stage}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const PROBLEM_STATS = [
  {
    stat: "35%",
    description: "of infrastructure project delays are attributed to land acquisition.",
  },
  {
    stat: "~700",
    description: "highway projects delayed nationally, 35% of them due to land disputes.",
  },
  {
    stat: "₹1.67 lakh cr",
    description: "bullet-train cost overrun with a 5+ year delay, partly involving land acquisition.",
  },
  {
    stat: "₹2–5.5 lakh cr",
    description: "recurring cost-overrun range for central projects above ₹150 crore.",
  },
];

export function ProblemSection() {
  return (
    <section className="border-b border-hairline bg-paper">
      <div className="mx-auto max-w-(--container-content) px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <p className="font-mono text-xs tracking-wide text-navy-600">The problem</p>
          <h2 className="mt-3 font-display text-3xl leading-tight text-navy-950 sm:text-4xl">
            Land acquisition is the most fragmented part of India's project pipeline
          </h2>
          <p className="mt-4 text-ink-soft leading-relaxed">
            No agency, state, or district holds a single view of a case as it
            moves from identification to handover. Records, approvals and
            compensation live in separate systems and separate offices —
            and delay compounds at every handoff.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
          {PROBLEM_STATS.map((item) => (
            <div key={item.stat} className="bg-paper p-6">
              <p className="font-mono text-3xl text-navy-900">{item.stat}</p>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{item.description}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate">
          Problem-domain evidence, from the supplied SIH reference material — not BhoomiSetu outcomes.
        </p>
      </div>
    </section>
  );
}

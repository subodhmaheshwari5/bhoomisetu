const EXISTING_DO = ["Digitize ownership", "Digitize registration", "Provide parcel identifiers (ULPIN)", "Digitize land records"];

const INTEGRATIONS = [
  {
    name: "NGDRS",
    detail: "Implemented in 18 States/UTs; 13 more sharing data via API — 31 States/UTs covered.",
  },
  {
    name: "ULPIN / Bhu-Aadhaar",
    detail: "Adopted by 26 States/UTs, with a pilot underway in 7 more.",
  },
  {
    name: "DILRMP",
    detail: "168 districts across 16 States with more than 99% core-component completion.",
  },
];

export function WhySection() {
  return (
    <section id="why" className="border-b border-hairline bg-navy-950 text-white">
      <div className="mx-auto max-w-(--container-content) px-5 py-20 sm:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs tracking-wide text-gold-400">Why BhoomiSetu</p>
            <h2 className="mt-3 font-display text-3xl leading-tight text-white sm:text-4xl">
              Existing systems digitize the record. BhoomiSetu manages the process.
            </h2>
            <p className="mt-4 leading-relaxed text-navy-100/75">
              DILRMP, ULPIN and NGDRS already give India a strong foundation of
              digitized land records. BhoomiSetu is built to sit on top of that
              foundation — not replace it — and track the acquisition process
              those records feed into.
            </p>

            <ul className="mt-8 space-y-2.5">
              {EXISTING_DO.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-navy-100/80">
                  <span className="h-px w-4 bg-navy-100/40" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="border border-white/10 bg-white/[0.03] p-7">
            <p className="font-mono text-xs tracking-wide text-navy-100/60">Builds on, does not replace</p>
            <div className="mt-6 space-y-6">
              {INTEGRATIONS.map((item) => (
                <div key={item.name} className="border-t border-white/10 pt-5 first:border-t-0 first:pt-0">
                  <p className="font-display text-lg text-white">{item.name}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-navy-100/70">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

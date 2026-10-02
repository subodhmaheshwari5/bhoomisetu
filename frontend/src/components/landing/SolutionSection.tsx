import { FileStack, Map, Bell, UserRound } from "lucide-react";

const PILLARS = [
  {
    icon: FileStack,
    title: "Unified Case Tracking",
    description:
      "Every parcel, project and approval linked under one acquisition case ID — from proposal to handover.",
  },
  {
    icon: Map,
    title: "GIS + Digital Workflow",
    description:
      "Parcel-level maps tied directly to the acquisition workflow, so officers see location and process together.",
  },
  {
    icon: Bell,
    title: "Automated Alerts & Analytics",
    description:
      "Deadline tracking, bottleneck detection and explainable risk scores surface the cases that need attention first.",
  },
  {
    icon: UserRound,
    title: "Landowner Portal",
    description:
      "Citizens track their own case status, compensation and grievances in plain language, without visiting an office.",
  },
];

export function SolutionSection() {
  return (
    <section id="solution" className="border-b border-hairline bg-navy-50">
      <div className="mx-auto max-w-(--container-content) px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <p className="font-mono text-xs tracking-wide text-navy-600">The platform</p>
          <h2 className="mt-3 font-display text-3xl leading-tight text-navy-950 sm:text-4xl">
            One digital layer over the entire acquisition process
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="border border-hairline bg-white p-7">
              <pillar.icon className="h-6 w-6 text-navy-700" strokeWidth={1.6} aria-hidden="true" />
              <h3 className="mt-5 font-display text-xl text-navy-950">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{pillar.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

export function PlaceholderPage({
  title,
  description,
  icon: Icon = Construction,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="grid h-12 w-12 place-items-center border border-hairline text-navy-700">
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h2 className="mt-5 font-display text-xl text-navy-950">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
        {description ?? "This module is part of a later development phase and isn't built yet in this prototype."}
      </p>
    </div>
  );
}

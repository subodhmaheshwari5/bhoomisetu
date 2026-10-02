import { BhoomiSetuMark } from "./BhoomiSetuMark";

export function PublicFooter() {
  return (
    <footer className="border-t border-hairline bg-navy-950 text-navy-100">
      <div className="mx-auto max-w-(--container-content) px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <BhoomiSetuMark className="h-7 w-7" />
              <span className="font-display text-lg text-white">BhoomiSetu</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-navy-100/70">
              A digital monitoring, workflow and decision-support layer for land
              acquisition — built as a Smart India Hackathon 2026 prototype for
              PS ID 26016, Ministry of Rural Development / Department of Land
              Resources.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm sm:flex sm:gap-16">
            <div>
              <p className="font-medium text-white">Platform</p>
              <ul className="mt-3 space-y-2 text-navy-100/70">
                <li><a href="#solution" className="hover:text-gold-400">Solution</a></li>
                <li><a href="#how-it-works" className="hover:text-gold-400">Pipeline</a></li>
                <li><a href="#why" className="hover:text-gold-400">Why BhoomiSetu</a></li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-white">Access</p>
              <ul className="mt-3 space-y-2 text-navy-100/70">
                <li><a href="/login" className="hover:text-gold-400">Government Login</a></li>
                <li><a href="/landowner" className="hover:text-gold-400">Landowner Portal</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-navy-100/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Prototype demonstration — not connected to live government systems.
            Does not replace statutory processes, courts, or existing land-record
            systems.
          </p>
          <p>© 2026 BhoomiSetu · SIH 2026 Prototype</p>
        </div>
      </div>
    </footer>
  );
}

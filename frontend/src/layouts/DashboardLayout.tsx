import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { DashboardSidebar } from "../components/layout/DashboardSidebar";
import { DashboardTopbar } from "../components/layout/DashboardTopbar";
import { GOVERNMENT_DASHBOARD_NAV, ADMINISTRATION_NAV } from "../components/layout/navConfig";

function currentTitle(pathname: string): string {
  const all = [...GOVERNMENT_DASHBOARD_NAV, ...ADMINISTRATION_NAV];
  const exact = all.find((item) => item.path === pathname);
  if (exact) return exact.label;
  if (pathname.startsWith("/dashboard/cases/")) return "Case Detail";
  return "Overview";
}

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      <div className="hidden lg:block">
        <DashboardSidebar />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setMobileOpen(false)} />
          <div className="relative">
            <DashboardSidebar onNavigate={() => setMobileOpen(false)} />
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar onMenuClick={() => setMobileOpen(true)} title={currentTitle(location.pathname)} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

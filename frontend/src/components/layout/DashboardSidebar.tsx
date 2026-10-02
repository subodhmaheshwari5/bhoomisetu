import { NavLink } from "react-router-dom";
import { BhoomiSetuMark } from "./BhoomiSetuMark";
import { GOVERNMENT_DASHBOARD_NAV, ADMINISTRATION_NAV } from "./navConfig";
import { ADMIN_ROLES } from "../../data/authData";
import { useAuth } from "../../features/auth/useAuth";

function NavGroup({ title, items, onNavigate }: { title: string; items: typeof GOVERNMENT_DASHBOARD_NAV; onNavigate?: () => void }) {
  return (
    <div>
      <p className="px-3 font-mono text-[11px] tracking-wide text-navy-100/45">{title}</p>
      <div className="mt-2 flex flex-col gap-0.5">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/dashboard"}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-navy-100/75 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function DashboardSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const canSeeAdmin = user ? ADMIN_ROLES.includes(user.role) : false;

  return (
    <div className="flex h-full w-64 shrink-0 flex-col bg-navy-950 text-white">
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
        <BhoomiSetuMark className="h-7 w-7" />
        <span className="font-display text-base text-white">BhoomiSetu</span>
      </div>

      <nav className="flex-1 space-y-7 overflow-y-auto px-2 py-6">
        <NavGroup title="Government Dashboard" items={GOVERNMENT_DASHBOARD_NAV} onNavigate={onNavigate} />
        {canSeeAdmin && (
          <NavGroup title="Administration" items={ADMINISTRATION_NAV} onNavigate={onNavigate} />
        )}
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <p className="font-mono text-[10px] leading-relaxed text-navy-100/40">
          Prototype · Demo data only
        </p>
      </div>
    </div>
  );
}

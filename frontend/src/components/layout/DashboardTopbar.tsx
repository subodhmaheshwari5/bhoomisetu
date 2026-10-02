import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, Search } from "lucide-react";
import { ROLE_LABELS } from "../../data/authData";
import { useAuth } from "../../features/auth/useAuth";
import { useApi } from "../../hooks/useApi";
import { apiGet, apiPut } from "../../services/apiClient";
import { AIAssistantButton } from "../AIAssistantButton";
import type { ApiNotification } from "../../types/api";
import { groupNotificationsByDay } from "../../utils/notificationGrouping";

function initialsFor(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function DashboardTopbar({ onMenuClick, title }: { onMenuClick: () => void; title: string }) {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const notificationsQuery = useApi(() => apiGet<ApiNotification[]>("/notifications"), []);
  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const groups = groupNotificationsByDay(notifications);

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate("/", { replace: true });
  }

  async function handleNotificationClick(notification: ApiNotification) {
    setNotificationsOpen(false);
    if (!notification.isRead) {
      apiPut(`/notifications/${notification.id}/read`).then(() => notificationsQuery.refetch());
    }
    if (notification.caseId) {
      navigate(`/dashboard/cases/${notification.caseId}`);
    }
  }

  async function handleMarkAllRead() {
    await apiPut("/notifications/read-all");
    notificationsQuery.refetch();
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-hairline bg-white px-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="grid h-9 w-9 place-items-center border border-hairline text-navy-900 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="hidden text-sm font-medium text-navy-950 sm:block">{title}</h1>

<div className="ml-auto flex flex-1 items-center justify-end gap-3 sm:flex-none">
          <AIAssistantButton />
          
          <label className="relative hidden max-w-xs flex-1 sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Case ID, ULPIN, district…"
            className="w-full border border-hairline bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-slate focus:border-navy-500 focus:outline-none"
          />
        </label>

        <div className="relative">
          <button
            type="button"
            onClick={() => setNotificationsOpen((v) => !v)}
            aria-expanded={notificationsOpen}
            className="relative grid h-9 w-9 place-items-center border border-hairline text-navy-900 hover:bg-paper-dim"
            aria-label={`${unreadCount} unread notifications`}
          >
            <Bell className="h-4 w-4" strokeWidth={1.75} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 font-mono text-[10px] text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotificationsOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-2 w-80 border border-hairline bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
                  <p className="text-xs font-medium text-navy-950">Notifications</p>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-[11px] font-medium text-navy-700 hover:text-navy-950"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notificationsQuery.loading && <p className="px-3 py-4 text-xs text-ink-soft">Loading…</p>}
                  {notificationsQuery.error && (
                    <p className="px-3 py-4 text-xs text-danger">{notificationsQuery.error}</p>
                  )}
                  {!notificationsQuery.loading && notifications.length === 0 && (
                    <p className="px-3 py-4 text-xs text-ink-soft">No notifications yet.</p>
                  )}
                  {groups.map((group) => (
                    <div key={group.label}>
                      <p className="bg-paper-dim/60 px-3 py-1 font-mono text-[10px] tracking-wide text-slate">
                        {group.label}
                      </p>
                      {group.notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleNotificationClick(n)}
                          className="block w-full border-b border-hairline px-3 py-2.5 text-left last:border-b-0 hover:bg-paper-dim"
                        >
                          <div className="flex items-center gap-1.5">
                            {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden="true" />}
                            <p className={`text-xs ${n.isRead ? "text-ink-soft" : "font-medium text-navy-950"}`}>
                              {n.title}
                            </p>
                          </div>
                          <p className="mt-0.5 text-[11px] text-ink-soft">{n.message}</p>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {user && (
          <div className="relative border-l border-hairline pl-3">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              className="flex items-center gap-2"
            >
              <div className="grid h-8 w-8 place-items-center rounded-full bg-navy-100 font-mono text-xs text-navy-800">
                {initialsFor(user.name)}
              </div>
              <div className="hidden text-left leading-tight sm:block">
                <p className="text-xs font-medium text-navy-950">{user.name}</p>
                <p className="text-[11px] text-slate">{ROLE_LABELS[user.role]}</p>
              </div>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-2 w-52 border border-hairline bg-white py-1 shadow-sm">
                  <div className="border-b border-hairline px-3 py-2">
                    <p className="truncate text-xs text-ink-soft">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-paper-dim"
                  >
                    <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

import { Bell, BellOff, CheckCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { DemoTag } from "../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../../components/ui/AsyncState";
import { useApi } from "../../hooks/useApi";
import { apiGet, apiPut } from "../../services/apiClient";
import type { ApiNotification } from "../../types/api";

/** A short relative time reads better than a raw timestamp in a dense list. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

export function NotificationsPage() {
  const query = useApi(() => apiGet<ApiNotification[]>("/notifications"), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const all = query.data ?? [];
  const unreadCount = all.filter((n) => !n.isRead).length;

  async function markOneRead(id: string) {
    setBusyId(id);
    try {
      await apiPut(`/notifications/${id}/read`);
      // Refetch rather than patching local state: the server owns read status.
      query.refetch();
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await apiPut("/notifications/read-all");
      query.refetch();
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-navy-950">
            <Bell className="h-5 w-5 text-navy-700" strokeWidth={1.75} />
            Notifications
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"} · alerts raised against cases you handle
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DemoTag label="Live data · demo dataset" />
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0 || markingAll}
            className="flex items-center gap-1.5 border border-hairline px-3 py-1.5 text-xs font-medium text-navy-900 transition hover:bg-paper-dim disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {markingAll ? "Marking…" : "Mark all read"}
          </button>
        </div>
      </div>

      {query.loading && <LoadingBlock label="Loading notifications…" />}
      {!query.loading && query.error && (
        <div className="mt-6">
          <ErrorBlock message={query.error} onRetry={query.refetch} />
        </div>
      )}

      {!query.loading && !query.error && (
        <div className="mt-6 divide-y divide-hairline border border-hairline bg-white">
          {all.map((n) => (
            <article
              key={n.id}
              className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 ${
                n.isRead ? "bg-white" : "bg-navy-50/60"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {!n.isRead && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-label="Unread" />
                  )}
                  <h2 className="text-sm font-medium text-navy-950">{n.title}</h2>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-slate">{n.type}</span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">{n.message}</p>
                <p className="mt-1 font-mono text-[11px] text-slate">
                  {n.caseId ? (
                    <Link
                      to={`/dashboard/cases/${n.caseId}`}
                      className="underline decoration-hairline underline-offset-4 hover:text-navy-700"
                    >
                      {n.caseNumber ?? n.caseId}
                    </Link>
                  ) : (
                    <span>System-wide</span>
                  )}
                  <span className="mx-1.5" aria-hidden="true">
                    ·
                  </span>
                  {relativeTime(n.createdAt)}
                </p>
              </div>

              {!n.isRead && (
                <button
                  type="button"
                  onClick={() => markOneRead(n.id)}
                  disabled={busyId === n.id}
                  className="shrink-0 border border-hairline px-2.5 py-1 text-xs font-medium text-navy-900 transition hover:bg-paper-dim disabled:opacity-40"
                >
                  {busyId === n.id ? "…" : "Mark read"}
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      {!query.loading && !query.error && all.length === 0 && (
        <div className="mt-6">
          <EmptyBlock message="No notifications for this account." />
        </div>
      )}

      {!query.loading && !query.error && all.length > 0 && unreadCount === 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate">
          <BellOff className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          Everything has been read.
        </p>
      )}
    </div>
  );
}

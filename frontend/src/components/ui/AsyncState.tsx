import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft">
      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 border border-danger/30 bg-danger-bg px-6 py-10 text-center">
      <AlertTriangle className="h-5 w-5 text-danger" strokeWidth={1.75} aria-hidden="true" />
      <p className="max-w-sm text-sm text-danger">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger hover:bg-white"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 border border-dashed border-hairline px-6 py-10 text-center text-sm text-ink-soft">
      <Inbox className="h-5 w-5 text-slate" strokeWidth={1.75} aria-hidden="true" />
      {message}
    </div>
  );
}

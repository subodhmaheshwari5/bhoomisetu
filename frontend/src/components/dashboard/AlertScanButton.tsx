import { useState } from "react";
import { Zap } from "lucide-react";
import { apiPost, ApiRequestError } from "../../services/apiClient";
import type { ApiAlertScanResult } from "../../types/api";

export function AlertScanButton({ onScanComplete }: { onScanComplete?: () => void }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ApiAlertScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const scanResult = await apiPost<ApiAlertScanResult>("/admin/alerts/run");
      setResult(scanResult);
      onScanComplete?.();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not run the alert scan.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleRun}
        disabled={running}
        title="Simulates the scheduled deadline/high-risk scan that also runs automatically every 5 minutes"
        className="flex items-center gap-1.5 border border-hairline px-3 py-1.5 text-xs font-medium text-navy-900 hover:bg-paper-dim disabled:opacity-60"
      >
        <Zap className="h-3.5 w-3.5" strokeWidth={1.75} />
        {running ? "Scanning…" : "Run Alert Scan"}
      </button>
      {result && (
        <span className="text-xs text-ink-soft">
          {result.notificationsCreated} notification{result.notificationsCreated === 1 ? "" : "s"} created
        </span>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

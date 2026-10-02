import { app } from "./app.js";
import { env } from "./config/env.js";
import { runAlertScan } from "./services/alertEngineService.js";

const ALERT_SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

app.listen(env.port, () => {
  console.log(`BhoomiSetu API listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

// Section 44: "a scheduled service" that flags overdue stages and notifies
// officers. Runs on an interval here (a real deployment would use a proper
// cron/queue); it's also triggerable on demand via POST /api/admin/alerts/run
// so a demo doesn't have to wait for the interval to tick.
function scheduleAlertScan() {
  runAlertScan()
    .then((result) => {
      if (result.notificationsCreated > 0) {
        console.log(
          `[alert-scan] ${result.deadlineExceeded} newly overdue, ${result.deadlineApproaching} approaching, ` +
            `${result.highRiskCases} high-risk, ${result.notificationsCreated} notifications created`,
        );
      }
    })
    .catch((err) => console.error("[alert-scan] failed:", err));
}

setTimeout(scheduleAlertScan, 15_000); // give the DB pool a moment on cold start
setInterval(scheduleAlertScan, ALERT_SCAN_INTERVAL_MS);

import { withTransaction } from "../config/db.js";

const OFFICER_ROLES = ["super_admin", "dolr_officer", "state_officer", "district_officer"];

export interface AlertScanResult {
  deadlineExceeded: number;
  deadlineApproaching: number;
  highRiskCases: number;
  notificationsCreated: number;
  scannedAt: string;
}

async function notifyOfficers(
  client: import("pg").PoolClient,
  caseId: string,
  type: string,
  title: string,
  message: string,
): Promise<number> {
  const { rows: officers } = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE role = ANY($1::user_role[])`,
    [OFFICER_ROLES],
  );

  // Avoid re-notifying the same officer about the same case+type within 24h.
  const { rows: recentlyNotified } = await client.query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM notifications
     WHERE case_id = $1 AND type = $2 AND created_at > now() - interval '24 hours'`,
    [caseId, type],
  );
  const alreadyNotified = new Set(recentlyNotified.map((r) => r.user_id));

  let created = 0;
  for (const officer of officers) {
    if (alreadyNotified.has(officer.id)) continue;
    await client.query(
      `INSERT INTO notifications (user_id, case_id, type, title, message) VALUES ($1, $2, $3, $4, $5)`,
      [officer.id, caseId, type, title, message],
    );
    created++;
  }
  return created;
}

/**
 * Runs the automated alert scan described in section 44: stages whose
 * due_date has passed get marked delayed (with a notification); stages
 * due within 3 days get a "deadline approaching" heads-up; high-risk
 * cases get flagged. Designed to run on a schedule (see server.ts) or be
 * triggered on demand by an admin for the demo.
 */
export async function runAlertScan(): Promise<AlertScanResult> {
  return withTransaction(async (client) => {
    let notificationsCreated = 0;

    // --- Deadline exceeded: overdue in-progress stages get marked delayed ---
    const { rows: overdueStages } = await client.query<{
      id: string;
      case_id: string;
      case_number: string;
      stage_name: string;
      due_date: string;
    }>(
      `SELECT s.id, s.case_id, c.case_number, s.stage_name, s.due_date
       FROM acquisition_stages s
       JOIN acquisition_cases c ON c.id = s.case_id
       WHERE s.status = 'in_progress' AND s.due_date IS NOT NULL AND s.due_date < CURRENT_DATE`,
    );

    for (const stage of overdueStages) {
      const { rows: delayRows } = await client.query<{ days: number }>(
        `SELECT (CURRENT_DATE - $1::date)::int AS days`,
        [stage.due_date],
      );
      const delayDays = delayRows[0]?.days ?? 1;

      await client.query(
        `UPDATE acquisition_stages SET status = 'delayed', delay_days = $1 WHERE id = $2`,
        [delayDays, stage.id],
      );
      await client.query(`UPDATE acquisition_cases SET status = 'delayed', updated_at = now() WHERE id = $1`, [
        stage.case_id,
      ]);
      await client.query(
        `INSERT INTO audit_logs (action, entity, entity_id, new_value)
         VALUES ('DEADLINE_EXCEEDED_AUTO_FLAG', 'acquisition_stage', $1, $2)`,
        [stage.id, JSON.stringify({ delayDays })],
      );

      notificationsCreated += await notifyOfficers(
        client,
        stage.case_id,
        "deadline_exceeded",
        `${stage.case_number}: deadline exceeded`,
        `${stage.stage_name} has exceeded its scheduled deadline by ${delayDays} day${delayDays === 1 ? "" : "s"}.`,
      );
    }

    // --- Deadline approaching: in-progress stages due within the next 3 days ---
    const { rows: approachingStages } = await client.query<{
      case_id: string;
      case_number: string;
      stage_name: string;
      due_date: string;
    }>(
      `SELECT s.case_id, c.case_number, s.stage_name, s.due_date
       FROM acquisition_stages s
       JOIN acquisition_cases c ON c.id = s.case_id
       WHERE s.status = 'in_progress' AND s.due_date IS NOT NULL
         AND s.due_date >= CURRENT_DATE AND s.due_date <= CURRENT_DATE + INTERVAL '3 days'`,
    );

    for (const stage of approachingStages) {
      notificationsCreated += await notifyOfficers(
        client,
        stage.case_id,
        "deadline_approaching",
        `${stage.case_number}: deadline approaching`,
        `${stage.stage_name} is due by ${new Date(stage.due_date).toLocaleDateString("en-IN")}.`,
      );
    }

    // --- High-risk cases (risk_level high/critical) ---
    const { rows: highRiskCases } = await client.query<{ id: string; case_number: string; risk_level: string }>(
      `SELECT id, case_number, risk_level FROM acquisition_cases WHERE risk_level IN ('high', 'critical')`,
    );
    for (const c of highRiskCases) {
      notificationsCreated += await notifyOfficers(
        client,
        c.id,
        "high_risk_case",
        `${c.case_number}: high-risk case`,
        `This case is flagged ${c.risk_level} risk and may need prioritized review.`,
      );
    }

    return {
      deadlineExceeded: overdueStages.length,
      deadlineApproaching: approachingStages.length,
      highRiskCases: highRiskCases.length,
      notificationsCreated,
      scannedAt: new Date().toISOString(),
    };
  });
}

import { pool } from "../config/db.js";
import { camelCaseRows } from "../utils/rowMapper.js";

export async function listNotificationsForUser(userId: string) {
  const { rows } = await pool.query(
    `
    SELECT n.id, n.case_id, c.case_number, n.type, n.title, n.message, n.is_read, n.created_at
    FROM notifications n
    LEFT JOIN acquisition_cases c ON c.id = n.case_id
    WHERE n.user_id = $1
    ORDER BY n.created_at DESC
  `,
    [userId],
  );
  return camelCaseRows(rows);
}

/** Marks a single notification read — scoped to the owning user so one account can't touch another's notifications. */
export async function markNotificationRead(id: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (rowCount ?? 0) > 0;
}

/** Marks every notification for this user as read — backs a "mark all read" action. */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
    [userId],
  );
  return rowCount ?? 0;
}

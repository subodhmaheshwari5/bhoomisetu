import type { ApiNotification } from "../types/api";

export interface NotificationGroup {
  label: "Today" | "Yesterday" | "Earlier";
  notifications: ApiNotification[];
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function groupNotificationsByDay(notifications: ApiNotification[]): NotificationGroup[] {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const today: ApiNotification[] = [];
  const yesterdayGroup: ApiNotification[] = [];
  const earlier: ApiNotification[] = [];

  for (const n of notifications) {
    const created = new Date(n.createdAt);
    if (isSameDay(created, now)) today.push(n);
    else if (isSameDay(created, yesterday)) yesterdayGroup.push(n);
    else earlier.push(n);
  }

  const groups: NotificationGroup[] = [
    { label: "Today", notifications: today },
    { label: "Yesterday", notifications: yesterdayGroup },
    { label: "Earlier", notifications: earlier },
  ];
  return groups.filter((group) => group.notifications.length > 0);
}

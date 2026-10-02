import type { Request, Response } from "express";
import { listNotificationsForUser, markAllNotificationsRead, markNotificationRead } from "../services/notificationService.js";
import { ok, ApiError } from "../utils/apiResponse.js";

export async function getNotifications(req: Request, res: Response) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  const notifications = await listNotificationsForUser(req.user.id);
  ok(res, notifications);
}

export async function putNotificationRead(req: Request, res: Response) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  const found = await markNotificationRead(String(req.params.id), req.user.id);
  if (!found) {
    throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "Notification not found for this account.");
  }
  ok(res, { id: req.params.id, isRead: true });
}

export async function putAllNotificationsRead(req: Request, res: Response) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  const count = await markAllNotificationsRead(req.user.id);
  ok(res, { updated: count });
}

import { Router } from "express";
import { getNotifications, putAllNotificationsRead, putNotificationRead } from "../controllers/notificationController.js";

export const notificationRoutes = Router();

notificationRoutes.get("/", getNotifications);
notificationRoutes.put("/read-all", putAllNotificationsRead);
notificationRoutes.put("/:id/read", putNotificationRead);

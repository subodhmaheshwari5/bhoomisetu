import { Router } from "express";
import { getAnalytics } from "../controllers/analyticsController.js";

export const analyticsRoutes = Router();

analyticsRoutes.get("/", getAnalytics);

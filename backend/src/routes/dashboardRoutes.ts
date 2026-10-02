import { Router } from "express";
import { getDashboard } from "../controllers/dashboardController.js";

export const dashboardRoutes = Router();

dashboardRoutes.get("/", getDashboard);

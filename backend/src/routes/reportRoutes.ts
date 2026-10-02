import { Router } from "express";
import { getReport } from "../controllers/reportController.js";

export const reportRoutes = Router();

reportRoutes.get("/", getReport);

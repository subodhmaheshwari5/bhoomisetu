import { Router } from "express";
import { getGrievances, postGrievance, putGrievance } from "../controllers/grievanceController.js";
import { requireRole } from "../middleware/auth.js";

export const grievanceRoutes = Router();

const OFFICER_ROLES = ["super_admin", "dolr_officer", "state_officer", "district_officer"] as const;

grievanceRoutes.get("/", getGrievances);
grievanceRoutes.post("/", postGrievance);
grievanceRoutes.put("/:id", requireRole(...OFFICER_ROLES), putGrievance);

import { Router } from "express";
import {
  postRunAlertScan,
  getUsers,
  getStates,
  getDistricts,
  getSettings,
  patchSetting,
  getAuditLogs,
  getAuditFacets,
} from "../controllers/adminController.js";
import { requireRole } from "../middleware/auth.js";

export const adminRoutes = Router();

// Every route in this file is administrative. The guard is applied once here so a
// new endpoint cannot be added to this router without inheriting it, rather than
// relying on each route remembering to declare its own roles.
const requireAdmin = requireRole("super_admin", "dolr_officer");

adminRoutes.use(requireAdmin);

adminRoutes.post("/alerts/run", postRunAlertScan);

adminRoutes.get("/users", getUsers);
adminRoutes.get("/states", getStates);
adminRoutes.get("/districts", getDistricts);

adminRoutes.get("/settings", getSettings);
adminRoutes.patch("/settings/:key", patchSetting);

adminRoutes.get("/audit-logs", getAuditLogs);
adminRoutes.get("/audit-logs/facets", getAuditFacets);

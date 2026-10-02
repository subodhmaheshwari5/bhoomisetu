import { Router } from "express";
import {
  getCase,
  getCases,
  getCaseStages,
  postCase,
  putCase,
  putCaseStage,
} from "../controllers/caseController.js";
import { getCaseDocuments } from "../controllers/documentController.js";
import { getCaseRiskScore } from "../controllers/riskController.js";
import { requireRole } from "../middleware/auth.js";

export const caseRoutes = Router();

const OFFICER_ROLES = ["super_admin", "dolr_officer", "state_officer", "district_officer"] as const;

caseRoutes.get("/", getCases);
caseRoutes.post("/", requireRole(...OFFICER_ROLES), postCase);
caseRoutes.get("/:id", getCase);
caseRoutes.put("/:id", requireRole(...OFFICER_ROLES), putCase);
caseRoutes.get("/:id/stages", getCaseStages);
caseRoutes.put("/:id/stages/:stageId", requireRole(...OFFICER_ROLES), putCaseStage);
caseRoutes.get("/:id/documents", getCaseDocuments);
caseRoutes.get("/:id/risk-score", requireRole(...OFFICER_ROLES), getCaseRiskScore);

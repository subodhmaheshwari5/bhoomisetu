import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getCaseIntelligence,
  postAnalyzeCase,
  getBlockers,
  getEvidence,
  getRecommendations,
  getSimilarCases,
  getResolutions,
  postResolution,
  postSubmitResolution,
  postStartReview,
  postVerifyResolution,
  postRejectResolution,
  getResolution,
  getPrecedents,
  getTaxonomy,
} from "../controllers/intelligenceController.js";

/**
 * Acquisition Intelligence Engine routes.
 *
 * Mounted under /api/intelligence. requireAuth is already applied by the parent
 * router (routes/index.ts) — repeated here for explicitness, matching the
 * existing aiRoutes pattern.
 *
 * Note the ordering: `/cases/:caseId/...` is registered before
 * `/resolutions/:id`, and no route uses a wildcard, so there is no shadowing.
 */
export const intelligenceRoutes = Router();

intelligenceRoutes.get("/taxonomy", requireAuth, getTaxonomy);
intelligenceRoutes.get("/precedents", requireAuth, getPrecedents);

intelligenceRoutes.get("/cases/:caseId", requireAuth, getCaseIntelligence);
intelligenceRoutes.post("/cases/:caseId/analyze", requireAuth, postAnalyzeCase);
intelligenceRoutes.get("/cases/:caseId/blockers", requireAuth, getBlockers);
intelligenceRoutes.get("/cases/:caseId/evidence", requireAuth, getEvidence);
intelligenceRoutes.get("/cases/:caseId/recommendations", requireAuth, getRecommendations);
intelligenceRoutes.get("/cases/:caseId/similar-cases", requireAuth, getSimilarCases);

intelligenceRoutes.get("/cases/:caseId/resolutions", requireAuth, getResolutions);
intelligenceRoutes.post("/cases/:caseId/resolutions", requireAuth, postResolution);

intelligenceRoutes.get("/resolutions/:id", requireAuth, getResolution);
intelligenceRoutes.post("/resolutions/:id/submit", requireAuth, postSubmitResolution);
intelligenceRoutes.post("/resolutions/:id/review", requireAuth, postStartReview);
intelligenceRoutes.post("/resolutions/:id/verify", requireAuth, postVerifyResolution);
intelligenceRoutes.post("/resolutions/:id/reject", requireAuth, postRejectResolution);

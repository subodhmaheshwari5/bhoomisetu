import type { Response } from "express";
import { pool } from "../config/db.js";
import { ok, created, ApiError } from "../utils/apiResponse.js";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { analyzeCase, ANALYSIS_VERSION } from "../services/intelligenceService.js";
import { authorizeCaseAccess, isOfficer, redactForLandowner } from "../services/intelligenceAuthz.js";
import {
  createResolution,
  getResolutionById,
  listResolutionsForCase,
  submitResolution,
  startReview,
  verifyResolution,
  rejectResolution,
  findSimilarVerifiedPrecedents,
  listVerifiedPrecedents,
} from "../services/resolutionService.js";
import {
  createResolutionSchema,
  rejectResolutionSchema,
  analyzeCaseSchema,
} from "../validators/schemas.js";
import { BOTTLENECK_CATEGORIES } from "../types/intelligence.js";

function requireUser(req: AuthenticatedRequest) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  return req.user;
}

function caseIdParam(req: AuthenticatedRequest): string {
  const raw = req.params.caseId;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new ApiError(400, "INVALID_CASE_ID", "A case id is required.");
  }
  return raw;
}

/** GET /api/intelligence/cases/:caseId — full deterministic analysis. */
export async function getCaseIntelligence(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const caseId = await authorizeCaseAccess(caseIdParam(req), user);

  const analysis = await analyzeCase(caseId);
  if (!analysis) {
    throw new ApiError(404, "CASE_NOT_FOUND", "Acquisition case not found");
  }

  const similar = await findSimilarVerifiedPrecedents(
    caseId,
    analysis.primaryBlocker?.type ?? null,
  );

  return ok(res, redactForLandowner({ ...analysis, similarCases: similar }, user));
}

/** POST /api/intelligence/cases/:caseId/analyze — re-run and audit-log. */
export async function postAnalyzeCase(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const caseId = await authorizeCaseAccess(caseIdParam(req), user);
  const { recordAudit } = analyzeCaseSchema.parse(req.body ?? {});

  const analysis = await analyzeCase(caseId);
  if (!analysis) {
    throw new ApiError(404, "CASE_NOT_FOUND", "Acquisition case not found");
  }

  if (recordAudit) {
    // Stores the detected blockers and recommendation count. Never stores raw
    // prompts, provider payloads, or credentials.
    await pool.query(
      `INSERT INTO intelligence_audit_logs (case_id, user_id, action, analysis_version, detail)
       VALUES ($1,$2,'ANALYSIS_RUN',$3,$4)`,
      [
        caseId,
        user.id,
        ANALYSIS_VERSION,
        JSON.stringify({
          primaryBlocker: analysis.primaryBlocker?.type ?? null,
          blockerCount: analysis.allBlockers.length,
          recommendationCount: analysis.recommendations.length,
          evidenceCount: analysis.evidence.length,
          riskLevel: analysis.risk.level,
        }),
      ],
    );
  }

  return ok(res, redactForLandowner(analysis, user));
}

/** GET /api/intelligence/cases/:caseId/blockers */
export async function getBlockers(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const caseId = await authorizeCaseAccess(caseIdParam(req), user);
  const analysis = await analyzeCase(caseId);
  if (!analysis) throw new ApiError(404, "CASE_NOT_FOUND", "Acquisition case not found");

  return ok(res, {
    primaryBlocker: analysis.primaryBlocker,
    contributingFactors: analysis.contributingFactors,
    allBlockers: analysis.allBlockers,
    delayImpact: analysis.delayImpact,
  });
}

/** GET /api/intelligence/cases/:caseId/evidence */
export async function getEvidence(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const caseId = await authorizeCaseAccess(caseIdParam(req), user);
  const analysis = await analyzeCase(caseId);
  if (!analysis) throw new ApiError(404, "CASE_NOT_FOUND", "Acquisition case not found");

  return ok(res, {
    evidence: redactForLandowner({ evidence: analysis.evidence } as Record<string, unknown>, user).evidence,
  });
}

/** GET /api/intelligence/cases/:caseId/recommendations */
export async function getRecommendations(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const caseId = await authorizeCaseAccess(caseIdParam(req), user);
  const analysis = await analyzeCase(caseId);
  if (!analysis) throw new ApiError(404, "CASE_NOT_FOUND", "Acquisition case not found");

  return ok(res, {
    recommendations: analysis.recommendations,
    dependencyChain: analysis.dependencyChain,
    disclaimer: analysis.disclaimer,
  });
}

/** GET /api/intelligence/cases/:caseId/similar-cases */
export async function getSimilarCases(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const caseId = await authorizeCaseAccess(caseIdParam(req), user);
  const analysis = await analyzeCase(caseId);
  if (!analysis) throw new ApiError(404, "CASE_NOT_FOUND", "Acquisition case not found");

  const similar = await findSimilarVerifiedPrecedents(caseId, analysis.primaryBlocker?.type ?? null);
  return ok(res, { similarCases: similar });
}

/** GET /api/intelligence/cases/:caseId/resolutions */
export async function getResolutions(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const caseId = await authorizeCaseAccess(caseIdParam(req), user);
  return ok(res, await listResolutionsForCase(caseId));
}

/** POST /api/intelligence/cases/:caseId/resolutions */
export async function postResolution(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const caseId = await authorizeCaseAccess(caseIdParam(req), user);
  const input = createResolutionSchema.parse(req.body);
  const resolution = await createResolution(caseId, input, user);
  return created(res, resolution);
}

/** POST /api/intelligence/resolutions/:id/submit */
export async function postSubmitResolution(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  return ok(res, await submitResolution(String(req.params.id), user));
}

/** POST /api/intelligence/resolutions/:id/review */
export async function postStartReview(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  return ok(res, await startReview(String(req.params.id), user));
}

/** POST /api/intelligence/resolutions/:id/verify */
export async function postVerifyResolution(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  return ok(res, await verifyResolution(String(req.params.id), user));
}

/** POST /api/intelligence/resolutions/:id/reject */
export async function postRejectResolution(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const { reason } = rejectResolutionSchema.parse(req.body);
  return ok(res, await rejectResolution(String(req.params.id), reason, user));
}

/** GET /api/intelligence/resolutions/:id */
export async function getResolution(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const resolution = await getResolutionById(String(req.params.id));
  // Re-check access against the case the resolution belongs to.
  await authorizeCaseAccess(resolution.caseId, user);
  return ok(res, resolution);
}

/** GET /api/intelligence/precedents — institutional memory index. */
export async function getPrecedents(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  if (!isOfficer(user)) {
    throw new ApiError(403, "FORBIDDEN", "Verified precedents are available to officer roles only.");
  }
  return ok(res, await listVerifiedPrecedents());
}

/** GET /api/intelligence/taxonomy — the closed set of bottleneck categories. */
export async function getTaxonomy(_req: AuthenticatedRequest, res: Response) {
  return ok(res, {
    bottleneckCategories: BOTTLENECK_CATEGORIES,
    analysisVersion: ANALYSIS_VERSION,
  });
}

import type { Request, Response } from "express";
import {
  listDocumentsForCase,
  listDocuments,
  listDocumentCategories,
} from "../services/documentService.js";
import { getCaseById } from "../services/caseService.js";
import { authorizeCaseAccess } from "../services/intelligenceAuthz.js";
import { ok, ApiError } from "../utils/apiResponse.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

function requireUser(req: AuthenticatedRequest) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  return req.user;
}

/** First value of a query param, when it is a non-empty string. */
function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * GET /api/cases/:id/documents
 *
 * Access-checked against the specific case. This route previously only verified
 * that the case existed, so any authenticated account — including a landowner or
 * a land agency — could read every case's documents by id, which contradicted
 * the redaction model the intelligence endpoints already enforce.
 */
export async function getCaseDocuments(req: Request, res: Response) {
  const user = requireUser(req as AuthenticatedRequest);
  const caseId = await authorizeCaseAccess(String(req.params.id), user);
  await getCaseById(caseId); // 404s if the case doesn't exist
  ok(res, await listDocumentsForCase(caseId));
}

/** GET /api/documents — cross-case document register, scoped to the caller. */
export async function getDocuments(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  const limitRaw = queryString(req.query.limit);
  const parsedLimit = limitRaw === undefined ? undefined : Number(limitRaw);

  ok(
    res,
    await listDocuments(
      {
        status: queryString(req.query.status),
        category: queryString(req.query.category),
        caseId: queryString(req.query.caseId),
        search: queryString(req.query.search),
        // A non-numeric limit falls back to the default rather than reaching
        // Postgres as NaN, which would be a 500.
        limit: parsedLimit !== undefined && Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      },
      user,
    ),
  );
}

/** GET /api/documents/categories — categories in the caller's scope. */
export async function getDocumentCategories(req: AuthenticatedRequest, res: Response) {
  const user = requireUser(req);
  ok(res, await listDocumentCategories(user));
}

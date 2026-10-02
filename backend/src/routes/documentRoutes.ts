import { Router } from "express";
import { getDocuments, getDocumentCategories } from "../controllers/documentController.js";

/**
 * Cross-case document register.
 *
 * Mounted at /api/documents. requireAuth is applied by the parent router
 * (routes/index.ts); repeated here for explicitness, matching intelligenceRoutes.
 *
 * Row-level scoping lives in the service (see documentService.applyScope) because
 * it depends on the caller's role and district, not just on a route guard.
 */
export const documentRoutes = Router();

documentRoutes.get("/categories", getDocumentCategories);
documentRoutes.get("/", getDocuments);

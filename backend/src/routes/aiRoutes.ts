import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { chatHandler, suggestedPromptsHandler } from "../controllers/aiController.js";

export const aiRoutes = Router();

aiRoutes.post("/chat", requireAuth, chatHandler);
aiRoutes.post("/suggested-prompts", requireAuth, suggestedPromptsHandler);  // <-- CHANGED
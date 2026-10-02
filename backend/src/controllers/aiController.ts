import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { processChatRequest, getSuggestedPrompts } from "../services/aiService.js";
import type { AIChatRequest, AIContext } from "../types/index.js";

export async function chatHandler(req: AuthenticatedRequest, res: Response) {
  const { message, context, conversationHistory } = req.body as AIChatRequest;
  
  console.log(`[AI Chat] User: ${req.user?.email} (${req.user?.role}) | Message: "${message?.slice(0, 100)}" | Context:`, context);
  
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_MESSAGE", message: "Message is required" },
    });
  }
  
  if (message.length > 2000) {
    return res.status(400).json({
      success: false,
      error: { code: "MESSAGE_TOO_LONG", message: "Message exceeds maximum length of 2000 characters" },
    });
  }
  
  const user = req.user!;
  const aiContext: AIContext = {
    ...context,
    role: user.role,
  };
  
  try {
    const response = await processChatRequest(
      { message: message.trim(), context: aiContext, conversationHistory },
      { id: user.id, role: user.role, districtId: user.districtId }
    );
    
    console.log(
      `[AI Chat] Response: intent=${response.intent}, ` +
      `messageLength=${response.message.length}, sources=${response.sources?.length ?? 0}, ` +
      `context=${JSON.stringify(response.contextUsed ?? {})}`
    );
    return res.json({ success: true, data: response });
  } catch (error) {
    console.error("AI Chat Error:", error);
    return res.status(500).json({
      success: false,
      error: { code: "AI_ERROR", message: "AI assistant is temporarily unavailable" },
    });
  }
}

export async function suggestedPromptsHandler(req: AuthenticatedRequest, res: Response) {
  // The frontend POSTs { context }, so read it from the body rather than req.query.
  const body = req.body as { context?: AIContext } | undefined;
  const context: AIContext = { ...(body?.context ?? {}), role: req.user?.role };
  const prompts = getSuggestedPrompts(context);
  return res.json({ success: true, data: prompts });
}
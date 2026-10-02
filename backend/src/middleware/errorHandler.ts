import type { ErrorRequestHandler, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/apiResponse.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.originalUrl}` },
  });
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: err.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
  });
};

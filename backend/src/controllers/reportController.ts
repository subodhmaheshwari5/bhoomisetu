import type { Response } from "express";
import { z } from "zod";
import { generateReport, toCsv, type ReportType } from "../services/reportService.js";
import { ok, ApiError } from "../utils/apiResponse.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const reportTypeSchema = z.enum(["progress", "delayed", "compensation", "district-performance", "grievance-status"]);

export async function getReport(req: AuthenticatedRequest, res: Response) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");

  const parsed = reportTypeSchema.safeParse(req.query.type);
  if (!parsed.success) {
    throw new ApiError(
      400,
      "INVALID_REPORT_TYPE",
      "type must be one of: progress, delayed, compensation, district-performance, grievance-status.",
    );
  }
  const type: ReportType = parsed.data;

  const { districtId, status, format } = req.query;
  // A report is an export, so it is scoped exactly like the list it aggregates:
  // the caller's own districtId filter is ANDed with their authorization scope,
  // never used in place of it.
  const rows = await generateReport(
    type,
    {
      districtId: typeof districtId === "string" ? districtId : undefined,
      status: typeof status === "string" ? status : undefined,
    },
    req.user,
  );

  if (format === "csv") {
    const csv = toCsv((rows ?? []) as Record<string, unknown>[]);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${type}-report.csv"`);
    res.send(csv);
    return;
  }

  ok(res, rows);
}

import type { Request, Response } from "express";
import { getMyCases, getMyCompensation, getMyGrievances, getMyParcels } from "../services/landownerService.js";
import { ok, ApiError } from "../utils/apiResponse.js";

function requireUserId(req: Request): string {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  return req.user.id;
}

export async function getMyParcelsHandler(req: Request, res: Response) {
  ok(res, await getMyParcels(requireUserId(req)));
}

export async function getMyCasesHandler(req: Request, res: Response) {
  ok(res, await getMyCases(requireUserId(req)));
}

export async function getMyCompensationHandler(req: Request, res: Response) {
  ok(res, await getMyCompensation(requireUserId(req)));
}

export async function getMyGrievancesHandler(req: Request, res: Response) {
  ok(res, await getMyGrievances(requireUserId(req)));
}

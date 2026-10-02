import type { Request, Response } from "express";
import { listProjects } from "../services/projectService.js";
import { ok } from "../utils/apiResponse.js";

export async function getProjects(_req: Request, res: Response) {
  const projects = await listProjects();
  ok(res, projects);
}

import { Router } from "express";
import { getProjects } from "../controllers/projectController.js";

export const projectRoutes = Router();

projectRoutes.get("/", getProjects);

import { Router } from "express";
import { getCompensation } from "../controllers/compensationController.js";

export const compensationRoutes = Router();

compensationRoutes.get("/", getCompensation);

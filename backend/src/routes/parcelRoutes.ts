import { Router } from "express";
import { getParcelByUlpinParam, getParcels } from "../controllers/parcelController.js";

export const parcelRoutes = Router();

parcelRoutes.get("/", getParcels);
parcelRoutes.get("/:ulpin", getParcelByUlpinParam);

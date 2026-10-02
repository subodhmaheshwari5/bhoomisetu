import { Router } from "express";
import {
  getMyCasesHandler,
  getMyCompensationHandler,
  getMyGrievancesHandler,
  getMyParcelsHandler,
} from "../controllers/landownerController.js";

export const landownerRoutes = Router();

// Self-scoped by the JWT's user id — any authenticated role can call these,
// they just get an empty list back unless they're a linked landowner.
landownerRoutes.get("/me/parcels", getMyParcelsHandler);
landownerRoutes.get("/me/cases", getMyCasesHandler);
landownerRoutes.get("/me/compensation", getMyCompensationHandler);
landownerRoutes.get("/me/grievances", getMyGrievancesHandler);

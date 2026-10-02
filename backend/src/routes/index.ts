import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { authRoutes } from "./authRoutes.js";
import { dashboardRoutes } from "./dashboardRoutes.js";
import { caseRoutes } from "./caseRoutes.js";
import { documentRoutes } from "./documentRoutes.js";
import { parcelRoutes } from "./parcelRoutes.js";
import { projectRoutes } from "./projectRoutes.js";
import { compensationRoutes } from "./compensationRoutes.js";
import { rehabilitationRoutes } from "./rehabilitationRoutes.js";
import { grievanceRoutes } from "./grievanceRoutes.js";
import { notificationRoutes } from "./notificationRoutes.js";
import { analyticsRoutes } from "./analyticsRoutes.js";
import { reportRoutes } from "./reportRoutes.js";
import { landownerRoutes } from "./landownerRoutes.js";
import { adminRoutes } from "./adminRoutes.js";
import { aiRoutes } from "./aiRoutes.js";
import { intelligenceRoutes } from "./intelligenceRoutes.js";

export const apiRouter = Router();

// Login is the only unauthenticated endpoint; everything else requires a
// valid JWT (section 26/38: never rely on the frontend's route guard alone).
apiRouter.use("/auth", authRoutes);
apiRouter.use(requireAuth);

apiRouter.use("/dashboard", dashboardRoutes);
apiRouter.use("/cases", caseRoutes);
apiRouter.use("/documents", documentRoutes);
apiRouter.use("/parcels", parcelRoutes);
apiRouter.use("/projects", projectRoutes);
apiRouter.use("/compensation", compensationRoutes);
apiRouter.use("/rehabilitation", rehabilitationRoutes);
apiRouter.use("/grievances", grievanceRoutes);
apiRouter.use("/notifications", notificationRoutes);
apiRouter.use("/analytics", analyticsRoutes);
apiRouter.use("/reports", reportRoutes);
apiRouter.use("/landowner", landownerRoutes);
apiRouter.use("/admin", adminRoutes);
apiRouter.use("/ai", aiRoutes);
apiRouter.use("/intelligence", intelligenceRoutes);

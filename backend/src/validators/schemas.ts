import { z } from "zod";
import { REHABILITATION_STATUSES } from "../services/rehabilitationService.js";

// Single source of truth for the accepted case statuses, shared by the create
// and update schemas. These must stay in step with the `case_status` Postgres
// enum: while this list omitted `in_progress` and `on_hold`, the database
// accepted those values but the API rejected every request carrying them with
// a 400, so the enum additions were unreachable.
const CASE_STATUS_VALUES = [
  "on_track",
  "in_progress",
  "at_risk",
  "delayed",
  "completed",
  "on_hold",
] as const;

export const loginSchema = z.object({
  email: z.string().email("A valid email is required."),
  password: z.string().min(1, "Password is required."),
});

export const createCaseSchema = z.object({
  projectId: z.string().uuid("projectId must be a valid project UUID."),
  parcelId: z.string().uuid("parcelId must be a valid parcel UUID."),
  districtId: z.string().uuid("districtId must be a valid district UUID."),
  currentStage: z.number().int().min(1).max(10).default(1),
  assignedOfficer: z.string().min(1, "assignedOfficer is required."),
  status: z.enum(CASE_STATUS_VALUES).default("on_track"),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).default("low"),
});

export const updateCaseSchema = z.object({
  currentStage: z.number().int().min(1).max(10).optional(),
  status: z.enum(CASE_STATUS_VALUES).optional(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  assignedOfficer: z.string().min(1).optional(),
});

export const updateStageSchema = z.object({
  status: z.enum(["not_started", "in_progress", "completed", "delayed", "blocked"]).optional(),
  startDate: z.string().date().optional().nullable(),
  completionDate: z.string().date().optional().nullable(),
  dueDate: z.string().date().optional().nullable(),
  remarks: z.string().max(2000).optional().nullable(),
  responsibleOfficer: z.string().min(1).optional(),
  delayDays: z.number().int().min(0).optional().nullable(),
});

export const createGrievanceSchema = z.object({
  caseId: z.string().uuid("caseId must be a valid case UUID.").optional(),
  category: z.enum([
    "Compensation",
    "Ownership",
    "Survey",
    "Documentation",
    "Rehabilitation",
    "Consent/Dispute",
    "Other",
  ]),
  description: z.string().min(10, "Please provide a description of at least 10 characters."),
});

export const updateGrievanceSchema = z.object({
  status: z.enum(["submitted", "under_review", "assigned", "resolved", "rejected"]).optional(),
  assignedOfficer: z.string().min(1).optional(),
  resolution: z.string().max(2000).optional(),
});

/**
 * Query parameters for the R&R register.
 *
 * The status filter is validated against the same list the service and the
 * database CHECK constraint use. Without this the filter was an unvalidated
 * passthrough, so an unknown value silently returned an empty list instead of
 * telling the caller the status does not exist — which hid typos such as
 * `in-progress` for the real `in_progress`.
 */
/**
 * Body for PATCH /admin/settings/:key.
 *
 * `value` is any JSON value rather than a string, because settings are stored as
 * JSONB: some are numbers, some are objects. The secret case is refused in the
 * service, which is the only layer that knows which keys are secret.
 */
export const updateSettingSchema = z.object({
  value: z.unknown(),
});

/** Query parameters for the audit log. */
export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  entity: z.string().max(60).optional(),
  action: z.string().max(60).optional(),
});

export const rehabilitationQuerySchema = z.object({
  status: z.enum(REHABILITATION_STATUSES).optional(),
  caseId: z.string().uuid("caseId must be a valid case UUID.").optional(),
  search: z.string().max(200).optional(),
});

export const ulpinParamSchema = z
  .string()
  .regex(/^[A-Z]{2}-\d{2}-\d{12}$/, "ULPIN must look like RJ-08-123456789012.");

export const caseNumberParamSchema = z
  .string()
  .regex(/^BS-\d{4}-\d{5}$/, "Case ID must look like BS-2026-00124.");

// --- Acquisition Intelligence Engine ---------------------------------------

const problemTypeSchema = z.enum([
  "document_blocker",
  "approval_blocker",
  "compensation_blocker",
  "r_and_r_blocker",
  "legal_blocker",
  "grievance_blocker",
  "survey_blocker",
  "data_quality_blocker",
  "dependency_blocker",
  "department_handoff_blocker",
  "deadline_blocker",
  "ownership_verification_blocker",
  "payment_blocker",
  "gis_parcel_blocker",
  "unknown_blocker",
]);

export const createResolutionSchema = z.object({
  problemType: problemTypeSchema,
  stageNumber: z.number().int().min(1).max(10).optional().nullable(),
  problemDescription: z
    .string()
    .min(10, "Please describe the problem in at least 10 characters."),
  rootCause: z
    .string()
    .min(5, "A root cause is required — it is what makes this resolution reusable."),
  actionTaken: z.string().min(5, "Describe the action that was actually taken."),
  responsibleDepartment: z.string().min(1, "A responsible department is required."),
  resolution: z.string().min(5, "Describe how the problem was resolved."),
  outcome: z.string().min(3, "An outcome is required."),
  resolutionDate: z.string().date().optional(),
  supportingDocumentRefs: z.array(z.string().min(1)).max(20).optional(),
});

export const rejectResolutionSchema = z.object({
  reason: z.string().min(5, "A rejection reason is required for the audit record."),
});

export const analyzeCaseSchema = z.object({
  /**
   * Optional explicit trigger for the officer. The analysis itself is fully
   * deterministic; this flag only controls whether the run is audit-logged.
   */
  recordAudit: z.boolean().default(true),
});

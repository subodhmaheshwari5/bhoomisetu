import { pool } from "../config/db.js";
import { camelCaseKeys, camelCaseRows } from "../utils/rowMapper.js";
import { env } from "../config/env.js";
import type { AIIntent, AIContext, AIChatRequest, AIChatResponse, AISource, AISuggestedAction, UserRole } from "../types/index.js";

const DISCLAIMER = "BhoomiSetu AI provides informational and decision-support assistance based on available system records. It does not replace statutory authority, legal advice, or official government decisions.";

/**
 * Resolve the configured provider and produce the answer.
 *
 * `local` is a first-class, data-grounded provider: it answers directly from the
 * authorized records via generateLocalResponse(), so it needs no API key and
 * never fabricates values. `openai`/`gemini` build a grounded prompt from the
 * same records and return the model's text.
 *
 * If an external provider fails (missing key, network, malformed completion) we
 * fall back to the deterministic local answer over the same authorized data
 * instead of surfacing an error to the user.
 */
async function answerQuestion(
  data: any,
  intent: AIIntent,
  request: AIChatRequest,
  context: AIContext
): Promise<{ text: string; provider: string }> {
  const provider = resolveProvider();
  const local = () => generateLocalResponse(data, intent, request.message);

  if (provider === "local") {
    return { text: local(), provider: "local" };
  }

  const prompt = buildContextPrompt(data, intent, { ...context, message: request.message });

  try {
    const text = provider === "openai"
      ? await callOpenAIProvider(prompt)
      : await callGeminiProvider(prompt);
    return { text, provider };
  } catch (error) {
    console.error(`[AI] ${provider} provider failed, falling back to local:`, error);
    return { text: local(), provider: `${provider}->local` };
  }
}

async function callOpenAIProvider(prompt: string): Promise<string> {
  if (!env.aiApiKey) {
    throw new Error("AI_PROVIDER=openai requires AI_API_KEY to be set");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.aiApiKey}`,
    },
    body: JSON.stringify({
      model: env.aiModel,
      messages: [{ role: "user", content: prompt }],
      max_tokens: env.aiMaxTokens,
      temperature: env.aiTemperature,
    }),
  });
  
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI returned an empty completion");
  }
  return text;
}

async function callGeminiProvider(prompt: string): Promise<string> {
  if (!env.aiApiKey) {
    throw new Error("AI_PROVIDER=gemini requires AI_API_KEY to be set");
  }
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.aiModel}:generateContent?key=${env.aiApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: env.aiMaxTokens,
        temperature: env.aiTemperature,
      },
    }),
  });
  
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    throw new Error("Gemini returned an empty completion");
  }
  return text;
}

/**
 * Resolve the configured provider. `AI_PROVIDER` is normalized so that values
 * like "Local" or " OpenAI " still resolve correctly, and an unknown value
 * fails loudly instead of silently degrading to the local stub.
 */
function resolveProvider(): "local" | "openai" | "gemini" {
  const raw = (env.aiProvider ?? "local").trim().toLowerCase();
  if (raw === "openai" || raw === "gemini" || raw === "local") return raw;
  throw new Error(`Unsupported AI_PROVIDER "${env.aiProvider}". Use one of: local, openai, gemini.`);
}

function detectIntent(message: string): AIIntent {
  const lower = message.toLowerCase();
  // An explicit case reference always wins: it decides which records we load.
  const referencesCase = lower.includes("bs-") || /\bcase\b/.test(lower) || lower.includes("this case") || lower.includes("my case");

  if (lower.includes("delay") || lower.includes("overdue") || lower.includes("behind schedule")) {
    if (lower.includes("stage") || lower.includes("step")) return "CASE_STAGE";
    if (lower.includes("why")) return "CASE_DELAY";
    return "CASE_STATUS";
  }

  if (lower.includes("risk") || lower.includes("danger") || lower.includes("critical")) return "CASE_RISK";
  if (lower.includes("recommend") || lower.includes("suggest") || lower.includes("what should") || lower.includes("next step")) return "CASE_RECOMMENDATION";
  if (lower.includes("document") || lower.includes("file") || lower.includes("paper")) return "DOCUMENT_STATUS";
  if (lower.includes("compensation") || lower.includes("payment") || lower.includes("money") || lower.includes("amount")) return "COMPENSATION_STATUS";
  if (lower.includes("grievance") || lower.includes("complaint")) return "GRIEVANCE_STATUS";
  if (lower.includes("parcel") || lower.includes("ulpin")) return "PARCEL_DETAILS";
  if (lower.includes("stage") || lower.includes("step") || lower.includes("phase") || lower.includes("workflow")) return "WORKFLOW_EXPLANATION";

  // Case-scoped keywords below must not be shadowed by generic "update"/"alert"
  // wording when the question is actually about a specific case.
  if (referencesCase && lower.includes("notification")) return "NOTIFICATION_SUMMARY";
  if (lower.includes("notification") || lower.includes("alert")) return "NOTIFICATION_SUMMARY";

  if (lower.includes("dashboard") || lower.includes("summary") || lower.includes("overview") || lower.includes("attention today")) return "DASHBOARD_SUMMARY";
  if (lower.includes("analytics") || lower.includes("bottleneck") || lower.includes("trend") || lower.includes("statistic")) return "ANALYTICS_QUERY";
  if (lower.includes("report")) return "REPORT_QUERY";
  if (lower.includes("bottleneck") && (lower.includes("resolve") || lower.includes("fix") || lower.includes("solution"))) return "BOTTLENECK_RESOLUTION";
  if (lower.includes("delayed case") || lower.includes("show delayed") || lower.includes("list delayed")) return "DASHBOARD_SUMMARY";
  if (lower.includes("project")) return "PROJECT_STATUS";
  if (lower.includes("help") || lower.includes("how") || lower.includes("what is") || lower.includes("explain")) return "GENERAL_BHOOMISETU_HELP";
  if (lower.includes("case") || lower.includes("bs-")) return "CASE_SUMMARY";

  return "UNKNOWN";
}

async function getAuthorizedCaseIds(user: { id: string; role: UserRole; districtId?: string }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  
  if (user.role === "landowner") {
    params.push(user.id);
    conditions.push(`lp.landowner_id IN (SELECT id FROM landowners WHERE user_id = $${params.length})`);
  } else if (user.role === "district_officer" && user.districtId) {
    params.push(user.districtId);
    conditions.push(`c.district_id = $${params.length}`);
  } else if (user.role === "state_officer") {
    // State officers see all cases in their state - would need state_id on user
    // For now, allow all (admin-like for prototype)
  }
  // super_admin, dolr_officer see all
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  
  const { rows } = await pool.query<{ id: string }>(
    `SELECT c.id FROM acquisition_cases c
     JOIN land_parcels lp ON lp.id = c.parcel_id
     ${whereClause}`,
    params
  );
  
  return rows.map(r => r.id);
}

async function retrieveCaseData(caseId: string) {
  const { rows: caseRows } = await pool.query(
    `SELECT c.*, p.name as project_name, p.agency, lp.ulpin, d.name as district_name, d.state_name
     FROM acquisition_cases c
     JOIN projects p ON p.id = c.project_id
     JOIN land_parcels lp ON lp.id = c.parcel_id
     JOIN districts d ON d.id = c.district_id
     WHERE c.id = $1`,
    [caseId]
  );
  
  if (!caseRows[0]) return null;
  
  const caseData = camelCaseKeys(caseRows[0]);
  
  const { rows: stages } = await pool.query(
    `SELECT * FROM acquisition_stages WHERE case_id = $1 ORDER BY stage_number`,
    [caseId]
  );
  
  const { rows: documents } = await pool.query(
    `SELECT * FROM documents WHERE case_id = $1 ORDER BY created_at DESC`,
    [caseId]
  );
  
  const { rows: compensation } = await pool.query(
    `SELECT * FROM compensation WHERE case_id = $1`,
    [caseId]
  );
  
  const { rows: grievances } = await pool.query(
    `SELECT * FROM grievances WHERE case_id = $1 ORDER BY created_at DESC`,
    [caseId]
  );
  
  const { rows: notifications } = await pool.query(
    `SELECT * FROM notifications WHERE case_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [caseId]
  );
  
  const { rows: risk } = await pool.query(
    `SELECT * FROM risk_scores WHERE case_id = $1 ORDER BY computed_at DESC LIMIT 1`,
    [caseId]
  );
  
  return {
    case: caseData,
    stages: camelCaseRows(stages),
    documents: camelCaseRows(documents),
    compensation: camelCaseKeys(compensation[0]) ?? null,
    grievances: camelCaseRows(grievances),
    notifications: camelCaseRows(notifications),
    risk: camelCaseKeys(risk[0]) ?? null,
  };
}

async function retrieveDelayedCases(authorizedCaseIds: string[]) {
  const { rows } = await pool.query(
    `SELECT c.id, c.case_number, c.status, c.risk_level, c.current_stage, d.name as district_name,
            s.stage_name, s.delay_days
     FROM acquisition_cases c
     JOIN districts d ON d.id = c.district_id
     LEFT JOIN LATERAL (
       SELECT stage_name, delay_days
       FROM acquisition_stages
       WHERE case_id = c.id AND status = 'delayed'
       ORDER BY delay_days DESC NULLS LAST
       LIMIT 1
     ) s ON TRUE
     WHERE c.status = 'delayed' AND c.id = ANY($1::uuid[])
     ORDER BY s.delay_days DESC NULLS LAST
     LIMIT 10`,
    [authorizedCaseIds]
  );

  return camelCaseRows(rows);
}

async function retrieveNotificationsForUser(userId: string, authorizedCaseIds: string[]) {
  // Notifications are scoped to the signed-in user and to the cases they are
  // authorized to see, so the Copilot cannot surface another officer's alerts.
  const { rows } = await pool.query(
    `SELECT n.id, n.case_id, c.case_number, n.type, n.title, n.message, n.is_read, n.created_at
     FROM notifications n
     LEFT JOIN acquisition_cases c ON c.id = n.case_id
     WHERE n.user_id = $1
       ${authorizedCaseIds.length > 0 ? "AND (n.case_id IS NULL OR n.case_id = ANY($2::uuid[]))" : "AND n.case_id IS NULL"}
     ORDER BY n.created_at DESC
     LIMIT 15`,
    authorizedCaseIds.length > 0 ? [userId, authorizedCaseIds] : [userId]
  );

  return camelCaseRows(rows);
}

async function retrieveParcelData(parcelId: string) {
  const { rows } = await pool.query(
    `SELECT lp.*, d.name as district_name, d.state_name
     FROM land_parcels lp
     JOIN districts d ON d.id = lp.district_id
     WHERE lp.id = $1`,
    [parcelId]
  );
  
  if (!rows[0]) return null;
  
  const parcel = camelCaseKeys(rows[0]);
  
  const { rows: caseRows } = await pool.query(
    `SELECT c.* FROM acquisition_cases c WHERE c.parcel_id = $1`,
    [parcelId]
  );
  
  return {
    parcel,
    case: camelCaseKeys(caseRows[0]) ?? null,
  };
}

async function retrieveDashboardData() {
  const { rows: kpi } = await pool.query(
    `SELECT 
       COUNT(*) as total_cases,
       -- Keep in step with dashboardService.getKpiSummary so the Copilot does not
       -- quote a different "active acquisitions" figure from the dashboard tile.
       COUNT(*) FILTER (WHERE status IN ('on_track', 'in_progress', 'at_risk', 'delayed')) as active_acquisitions,
       COUNT(*) FILTER (WHERE status = 'delayed') as delayed_cases,
       COUNT(*) FILTER (WHERE status = 'completed') as completed_cases,
       COUNT(*) FILTER (WHERE risk_level IN ('high', 'critical')) as high_risk_cases
     FROM acquisition_cases`
  );
  
  const { rows: stageDist } = await pool.query(
    `SELECT s.stage_number, st.stage_name, COUNT(*) as count
     FROM acquisition_stages s
     JOIN acquisition_cases c ON c.id = s.case_id
     JOIN (VALUES 
       (1, 'Land Identification'), (2, 'Digital Land & Owner Records'),
       (3, 'Acquisition Proposal'), (4, 'Verification & Approval'),
       (5, 'Public Notification'), (6, 'Compensation Assessment'),
       (7, 'Compensation Disbursement'), (8, 'Rehabilitation & Resettlement'),
       (9, 'Land Handover'), (10, 'Real-Time Monitoring & Reports')
     ) st(stage_number, stage_name) ON st.stage_number = s.stage_number
     WHERE s.status IN ('in_progress', 'delayed', 'blocked')
     GROUP BY s.stage_number, st.stage_name
     ORDER BY s.stage_number`
  );
  
  const { rows: districtPerf } = await pool.query(
    `SELECT d.name as district, COUNT(*) as cases
     FROM acquisition_cases c
     JOIN districts d ON d.id = c.district_id
     GROUP BY d.name
     ORDER BY cases DESC`
  );
  
  return {
    kpi: camelCaseKeys(kpi[0]),
    stageDistribution: camelCaseRows(stageDist),
    districtPerformance: camelCaseRows(districtPerf),
  };
}

function buildContextPrompt(data: any, _intent: AIIntent, context: AIContext & { message?: string }): string {
  const parts: string[] = [
    "You are BhoomiSetu Acquisition Copilot, an AI assistant for India's land acquisition management platform.",
    "Answer using ONLY the provided data. Never fabricate cases, ULPINs, compensation values, grievances, documents, officers, risk scores, deadlines, or government statistics.",
    "If data is not available, say: 'I could not find this information in the authorized BhoomiSetu records.'",
    "If data is demo data, note: 'This response is based on prototype demonstration data.'",
    "Use concise government workflow language. Prefer structured responses with STATUS, CURRENT STAGE, REASONS, RECOMMENDED NEXT STEP, SOURCES.",
    "",
    "=== AUTHORIZED DATA ===",
  ];
  
  if (data.case) {
    const c = data.case;
    parts.push(`CASE: ${c.caseNumber} (${c.projectName})`);
    parts.push(`  District: ${c.districtName}, ${c.stateName}`);
    parts.push(`  ULPIN: ${c.ulpin}`);
    parts.push(`  Current Stage: ${c.currentStage}. ${c.currentStage <= 10 ? ["Land Identification","Digital Land & Owner Records","Acquisition Proposal","Verification & Approval","Public Notification","Compensation Assessment","Compensation Disbursement","Rehabilitation & Resettlement","Land Handover","Real-Time Monitoring & Reports"][c.currentStage-1] : "Unknown"}`);
    parts.push(`  Status: ${c.status}`);
    parts.push(`  Risk Level: ${c.riskLevel}`);
    parts.push(`  Assigned Officer: ${c.assignedOfficer}`);
    parts.push(`  Created: ${c.createdAt}`);
    parts.push(`  Updated: ${c.updatedAt}`);
  }
  
  if (data.stages?.length) {
    parts.push("\nSTAGES:");
    for (const s of data.stages) {
      parts.push(`  ${s.stageNumber}. ${s.stageName}: ${s.status}${s.delayDays ? ` (${s.delayDays} days overdue)` : ""}${s.dueDate ? ` - Due: ${s.dueDate}` : ""}`);
      if (s.remarks) parts.push(`     Remarks: ${s.remarks}`);
    }
  }
  
  if (data.documents?.length) {
    parts.push("\nDOCUMENTS:");
    for (const d of data.documents) {
      parts.push(`  - ${d.category}: ${d.fileName} (${d.status}) - uploaded by ${d.uploadedBy} on ${d.uploadedAt}`);
    }
  }
  
  if (data.compensation) {
    parts.push("\nCOMPENSATION:");
    parts.push(`  Assessment: ₹${data.compensation.assessmentAmount ?? "Not assessed"}`);
    parts.push(`  Approval: ${data.compensation.approvalStatus}`);
    parts.push(`  Disbursement: ${data.compensation.disbursementStatus}`);
    if (data.compensation.paymentDate) parts.push(`  Payment Date: ${data.compensation.paymentDate}`);
    if (data.compensation.paymentReference) parts.push(`  Reference: ${data.compensation.paymentReference}`);
  }
  
  if (data.grievances?.length) {
    parts.push("\nGRIEVANCES:");
    for (const g of data.grievances) {
      parts.push(`  - ${g.grievanceNumber}: ${g.category} - ${g.status}${g.assignedOfficer ? ` (Assigned: ${g.assignedOfficer})` : ""}`);
    }
  }
  
  if (data.notifications?.length) {
    parts.push("\nRECENT NOTIFICATIONS:");
    for (const n of data.notifications.slice(0, 5)) {
      parts.push(`  - ${n.type}: ${n.title} - ${n.message} (${n.isRead ? "Read" : "Unread"})`);
    }
  }
  
  if (data.risk) {
    parts.push("\nRISK SCORE:");
    parts.push(`  Score: ${data.risk.score}/100 (${data.risk.level.toUpperCase()})`);
    parts.push(`  Reasons: ${data.risk.reasons?.join("; ") ?? "None"}`);
    parts.push(`  Recommendation: ${data.risk.recommendation}`);
    parts.push(`  Computed: ${data.risk.computedAt}`);
  }
  
  if (data.parcel) {
    parts.push("\nPARCEL:");
    parts.push(`  ULPIN: ${data.parcel.ulpin}`);
    parts.push(`  District: ${data.parcel.districtName}, ${data.parcel.stateName}`);
    parts.push(`  Area: ${data.parcel.areaHectares} ha`);
    parts.push(`  Land Use: ${data.parcel.landUse}`);
    parts.push(`  Landowner: ${data.parcel.landownerRef ?? "Unknown"}`);
  }
  
  if (data.dashboard) {
    parts.push("\nDASHBOARD KPIs:");
    parts.push(`  Total Cases: ${data.dashboard.kpi?.totalCases ?? 0}`);
    parts.push(`  Active: ${data.dashboard.kpi?.activeAcquisitions ?? 0}`);
    parts.push(`  Delayed: ${data.dashboard.kpi?.delayedCases ?? 0}`);
    parts.push(`  Completed: ${data.dashboard.kpi?.completedCases ?? 0}`);
    parts.push(`  High Risk: ${data.dashboard.kpi?.highRiskCases ?? 0}`);
  }
  
  parts.push("\n=== USER QUESTION ===");
  parts.push(context.message || "");
  
  parts.push("\n=== RESPONSE FORMAT ===");
  parts.push("Provide a structured response with: STATUS, CURRENT STAGE, KEY REASONS, RECOMMENDED NEXT STEP, SOURCES.");
  parts.push("Include suggested actions as buttons: [View Case], [View Documents], [View Risk], etc.");
  parts.push("End with disclaimer if using demo data.");
  
  return parts.join("\n");
}

function parseAIResponse(
  aiText: string,
  data: any,
  intent: AIIntent,
  contextUsed?: AIContext & { provider?: string }
): AIChatResponse {
  const sources: AISource[] = [];
  const suggestedActions: AISuggestedAction[] = [];
  
  if (data.case) {
    sources.push({ type: "case", id: data.case.id, label: `Case ${data.case.caseNumber}` });
    suggestedActions.push({ label: "View Case", type: "VIEW_CASE", targetId: data.case.id });
  }
  
  if (data.stages?.length) {
    const currentStage = data.stages.find((s: { status: string; stageNumber: number; stageName: string; id: string }) => s.status === "in_progress" || s.status === "delayed");
    if (currentStage) {
      sources.push({ type: "stage", id: currentStage.id, label: `Stage ${currentStage.stageNumber}: ${currentStage.stageName}` });
      suggestedActions.push({ label: "View Stage", type: "VIEW_STAGE", targetId: currentStage.id });
    }
  }
  
  if (data.documents?.length) {
    sources.push({ type: "document", id: "documents", label: `${data.documents.length} documents` });
    suggestedActions.push({ label: "View Documents", type: "VIEW_DOCUMENT", targetId: data.case?.id });
  }
  
  if (data.compensation) {
    sources.push({ type: "compensation", id: data.compensation.id, label: "Compensation Record" });
    suggestedActions.push({ label: "View Compensation", type: "VIEW_COMPENSATION", targetId: data.compensation.id });
  }
  
  if (data.grievances?.length) {
    sources.push({ type: "grievance", id: data.grievances[0].id, label: `${data.grievances.length} grievance(s)` });
    suggestedActions.push({ label: "View Grievances", type: "VIEW_GRIEVANCE", targetId: data.case?.id });
  }
  
  if (data.risk) {
    sources.push({ type: "risk", id: data.risk.id, label: `Risk Score: ${data.risk.score}` });
    suggestedActions.push({ label: "View Risk Details", type: "VIEW_ANALYTICS", targetId: data.case?.id });
  }
  
  if (data.parcel) {
    sources.push({ type: "parcel", id: data.parcel.id, label: `Parcel ${data.parcel.ulpin}` });
    suggestedActions.push({ label: "View Parcel", type: "VIEW_PARCEL", targetId: data.parcel.id });
  }
  
  if (data.notifications?.length) {
    sources.push({
      type: "notification",
      id: data.notifications[0].id,
      label: `${data.notifications.length} notification(s)`,
    });
  }

  if (data.dashboard) {
    sources.push({ type: "analytics", id: "dashboard", label: "Dashboard aggregates" });
    suggestedActions.push({ label: "View Analytics", type: "VIEW_ANALYTICS" });
  }

  return {
    message: aiText,
    intent,
    sources,
    contextUsed,
    suggestedActions,
    disclaimer: DISCLAIMER,
  };
}

export async function processChatRequest(
  request: AIChatRequest,
  user: { id: string; role: UserRole; districtId?: string }
): Promise<AIChatResponse> {
  const intent = detectIntent(request.message);
  const context = request.context || {};

  let data: any = { userRole: user.role, notifications: [] };

  try {
    const authorizedCases = await getAuthorizedCaseIds(user);

    if (context.caseId) {
      if (!authorizedCases.includes(context.caseId)) {
        return {
          message: "You are not authorized to access this case.",
          intent: "UNKNOWN",
          sources: [],
          suggestedActions: [],
          disclaimer: DISCLAIMER,
        };
      }
      data = (await retrieveCaseData(context.caseId)) ?? {};
      data.caseId = context.caseId;
    } else if (context.parcelId) {
      // A parcel is visible only when it is linked to a case the user may see.
      const { rows: parcelRows } = await pool.query(
        `SELECT c.id FROM acquisition_cases c
         WHERE c.parcel_id = $1 AND c.id = ANY($2::uuid[])
         LIMIT 1`,
        [context.parcelId, authorizedCases]
      );
      if (!parcelRows[0]) {
        return {
          message: "You are not authorized to access this parcel.",
          intent: "UNKNOWN",
          sources: [],
          suggestedActions: [],
          disclaimer: DISCLAIMER,
        };
      }
      data = (await retrieveParcelData(context.parcelId)) ?? {};
    } else if (context.ulpin) {
      const { rows } = await pool.query(`SELECT id FROM land_parcels WHERE ulpin = $1`, [context.ulpin]);
      if (rows[0]) {
        data = (await retrieveParcelData(rows[0].id)) ?? {};
      }
    } else if (
      intent === "DASHBOARD_SUMMARY" ||
      intent === "ANALYTICS_QUERY" ||
      intent === "REPORT_QUERY" ||
      intent === "BOTTLENECK_RESOLUTION" ||
      intent === "GENERAL_BHOOMISETU_HELP"
    ) {
      data.dashboard = await retrieveDashboardData();
      data.delayedCases = await retrieveDelayedCases(authorizedCases);
    }

    // Notification questions need the user's own alerts regardless of page.
    if (intent === "NOTIFICATION_SUMMARY") {
      data.notifications = await retrieveNotificationsForUser(user.id, authorizedCases);
    }
    
    // Provider dispatch. `local` answers directly from the authorized records;
    // external providers receive a grounded prompt built from the same records.
    const { text, provider } = await answerQuestion(data, intent, request, context);
    const response = parseAIResponse(text, data, intent, {
      caseId: context.caseId,
      parcelId: context.parcelId,
      provider,
    });

    console.log(
      `[AI] provider=${provider} intent=${intent} hasCase=${Boolean(data.case)} ` +
      `hasParcel=${Boolean(data.parcel)} hasDashboard=${Boolean(data.dashboard)} ` +
      `notifications=${data.notifications?.length ?? 0} messageLength=${text.length}`
    );

    return response;
  } catch (error) {
    console.error("AI Service Error:", error);
    return {
      message: "AI assistant is temporarily unavailable. You can still use the dashboard, case search, parcel search, and analytics features directly.",
      intent: "UNKNOWN",
      disclaimer: DISCLAIMER,
    };
  }
}

function generateLocalResponse(data: any, intent: AIIntent, userMessage: string): string {
  const parts: string[] = [];

  // Case-specific responses
  if (data.case) {
    const c = data.case;
    const stageName = c.currentStage <= 10 
      ? ["Land Identification","Digital Land & Owner Records","Acquisition Proposal","Verification & Approval","Public Notification","Compensation Assessment","Compensation Disbursement","Rehabilitation & Resettlement","Land Handover","Real-Time Monitoring & Reports"][c.currentStage-1]
      : "Unknown";
    
    parts.push(`CASE: ${c.caseNumber}`);
    parts.push(`STATUS: ${(c.status ?? "unknown").toUpperCase()}`);
    parts.push(`CURRENT STAGE: ${c.currentStage}. ${stageName}`);
    if (c.riskLevel) parts.push(`RISK LEVEL: ${c.riskLevel.toUpperCase()}`);
    
    if (data.stages?.length) {
      const currentStage = data.stages.find((s: any) => s.status === "in_progress" || s.status === "delayed");
      if (currentStage?.delayDays) {
        parts.push(`DELAY: ${currentStage.delayDays} day${currentStage.delayDays > 1 ? "s" : ""} overdue`);
      }
    }
    
    // Intent-specific details
    if (intent === "CASE_DELAY" || intent === "CASE_STATUS") {
      if (data.stages?.length) {
        const delayedStages = data.stages.filter((s: any) => s.status === "delayed");
        if (delayedStages.length > 0) {
          parts.push("\nKEY REASONS:");
          for (const s of delayedStages) {
            parts.push(`• Stage ${s.stageNumber} (${s.stageName}): ${s.delayDays} days overdue${s.remarks ? ` - ${s.remarks}` : ""}`);
          }
        }
        const pendingStages = data.stages.filter((s: any) => s.status === "pending_verification" || s.status === "in_progress");
        if (pendingStages.length > 0) {
          parts.push("• Pending documents/approvals in current stage");
        }
      }
      if (data.documents?.length) {
        const pendingDocs = data.documents.filter((d: any) => d.status === "pending_verification");
        if (pendingDocs.length > 0) {
          parts.push(`• ${pendingDocs.length} document${pendingDocs.length > 1 ? "s" : ""} pending verification`);
        }
      }
    }
    
    if (intent === "CASE_RISK" && data.risk) {
      parts.push(`\nRISK SCORE: ${data.risk.score}/100 (${data.risk.level.toUpperCase()})`);
      if (data.risk.reasons?.length) {
        parts.push("REASONS:");
        for (const r of data.risk.reasons) parts.push(`• ${r}`);
      }
    }
    
    if (intent === "DOCUMENT_STATUS" && data.documents?.length) {
      parts.push(`\nDOCUMENTS (${data.documents.length} total):`);
      const byStatus = data.documents.reduce((acc: any, d: any) => {
        acc[d.status] = (acc[d.status] || 0) + 1;
        return acc;
      }, {});
      for (const [status, count] of Object.entries(byStatus)) {
        parts.push(`• ${status.replace("_", " ")}: ${count}`);
      }
    }
    
    if (intent === "COMPENSATION_STATUS" && data.compensation) {
      const comp = data.compensation;
      parts.push(`\nCOMPENSATION:`);
      parts.push(`• Assessment: ₹${comp.assessmentAmount ?? "Not assessed"}`);
      parts.push(`• Approval: ${comp.approvalStatus.replace("_", " ")}`);
      parts.push(`• Disbursement: ${comp.disbursementStatus}`);
      if (comp.paymentDate) parts.push(`• Payment Date: ${comp.paymentDate}`);
    }
    
    if (intent === "GRIEVANCE_STATUS" && data.grievances?.length) {
      parts.push(`\nGRIEVANCES (${data.grievances.length}):`);
      for (const g of data.grievances) {
        parts.push(`• ${g.grievanceNumber}: ${g.category} - ${g.status.replace("_", " ")}${g.assignedOfficer ? ` (Assigned: ${g.assignedOfficer})` : ""}`);
      }
    }
    
    parts.push(`\nRECOMMENDED NEXT STEP: ${getRecommendation(data)}`);

    if (intent === "NOTIFICATION_SUMMARY" && data.notifications?.length) {
      parts.push(`\nRECENT NOTIFICATIONS (${data.notifications.length}):`);
      for (const n of data.notifications.slice(0, 5)) {
        parts.push(`• ${n.title}${n.caseNumber ? ` (${n.caseNumber})` : ""}: ${n.message} — ${n.isRead ? "read" : "UNREAD"}`);
      }
    }

    if (intent === "PROJECT_STATUS" && data.case?.projectName) {
      parts.push(`\nPROJECT: ${data.case.projectName}`);
      parts.push(`Agency: ${data.case.agency ?? "Not recorded"}`);
    }
  }
  // Notification summary without a specific case
  else if (data.notifications?.length) {
    const unread = data.notifications.filter((n: any) => !n.isRead);
    parts.push(`NOTIFICATIONS: ${data.notifications.length} recent, ${unread.length} unread`);
    for (const n of data.notifications.slice(0, 8)) {
      parts.push(`• ${n.title}${n.caseNumber ? ` (${n.caseNumber})` : ""}: ${n.message} — ${n.isRead ? "read" : "UNREAD"}`);
    }
    parts.push(`\nRECOMMENDED NEXT STEP: Review ${unread.length} unread notification${unread.length === 1 ? "" : "s"}.`);
  }
  // Dashboard/Analytics responses
  else if (data.dashboard) {
    const kpi = data.dashboard.kpi;
    parts.push(`DASHBOARD SNAPSHOT:`);
    parts.push(`• Total Cases: ${kpi?.totalCases ?? 0}`);
    parts.push(`• Active: ${kpi?.activeAcquisitions ?? 0}`);
    parts.push(`• Delayed: ${kpi?.delayedCases ?? 0}`);
    parts.push(`• High/Critical Risk: ${kpi?.highRiskCases ?? 0}`);
    
    const topStage = data.dashboard.stageDistribution?.[0];
    if (topStage) {
      parts.push(`\nTOP BOTTLENECK: Stage ${topStage.stageNumber} (${topStage.stageName}) with ${topStage.count} active cases`);
    }

    if (data.delayedCases?.length) {
      parts.push(`\nDELAYED CASES (${data.delayedCases.length} shown):`);
      for (const c of data.delayedCases) {
        const stage = c.stageName ? ` at Stage ${c.stageName}` : "";
        const days = c.delayDays ? ` (${c.delayDays} days overdue)` : "";
        parts.push(`• ${c.caseNumber} — ${c.districtName}${stage}${days}`);
      }
    } else {
      parts.push("\nDELAYED CASES: None currently marked delayed.");
    }

    parts.push(`\nRECOMMENDED NEXT STEP: Review delayed cases and Stage ${topStage?.stageNumber ?? 6} bottlenecks`);
  }
  // Parcel responses
  else if (data.parcel) {
    const p = data.parcel;
    parts.push(`PARCEL: ${p.ulpin}`);
    parts.push(`District: ${p.districtName}, ${p.stateName}`);
    parts.push(`Area: ${p.areaHectares} ha • Land Use: ${p.landUse}`);
    if (data.case) {
      parts.push(`\nLINKED CASE: ${data.case.caseNumber} (${data.case.projectName})`);
      parts.push(`Status: ${data.case.status} • Stage: ${data.case.currentStage} • Risk: ${data.case.riskLevel}`);
    } else {
      parts.push("\nNo active acquisition case linked to this parcel.");
    }
  }
  // Nothing was retrieved for this question. Be explicit instead of claiming
  // the system is in "prototype mode" — the local provider is a working,
  // data-grounded provider, not a stub.
  else {
    parts.push(`I could not find information for "${userMessage}" in the BhoomiSetu records you are authorized to view.`);
    parts.push("\nThis Copilot answers from live authorized records. Try one of these:");
    parts.push("• Open a case page and ask about its status, stages, documents, or risk.");
    parts.push("• Select a parcel on the Land Map and ask about that parcel.");
    parts.push("• Ask from the dashboard: \"What needs attention today?\" or \"Which stages are causing delays?\"");
    if (!contextPageHint(data)) {
      parts.push("\nTip: open the Copilot from a case or parcel page so it knows which records you mean.");
    }
  }

  return parts.join("\n");
}

function contextPageHint(data: any): boolean {
  return Boolean(data.case || data.parcel || data.dashboard || data.notifications?.length);
}

function getRecommendation(data: any): string {
  const riskLevel = data.risk?.level;
  if (riskLevel === "critical" || riskLevel === "high") {
    return "Escalate immediately for District Officer review";
  }

  const delayed = data.stages?.find((s: any) => s.status === "delayed");
  if (delayed) {
    const overdue = delayed.delayDays ? `, ${delayed.delayDays} days overdue` : "";
    return `Resolve Stage ${delayed.stageNumber} (${delayed.stageName})${overdue} and clear pending document verification`;
  }

  // camelCaseKeys output, so the key is approvalStatus, not approval_status.
  const approvalStatus = data.compensation?.approvalStatus;
  if (approvalStatus && approvalStatus !== "approved") {
    return "Submit the compensation package for District Officer approval";
  }

  const openGrievance = data.grievances?.find((g: any) => g.status !== "resolved" && g.status !== "rejected");
  if (openGrievance) {
    return `Address open grievance ${openGrievance.grievanceNumber}`;
  }

  const pendingDocs = data.documents?.filter((d: any) => d.status === "pending_verification").length ?? 0;
  if (pendingDocs > 0) {
    return `Verify ${pendingDocs} pending document${pendingDocs === 1 ? "" : "s"} to keep the case moving`;
  }

  return "No action needed — case is progressing normally";
}

export function getSuggestedPrompts(context: AIContext): string[] {
  if (context.caseId) {
    return [
      "Why is this case delayed?",
      "What documents are missing?",
      "Explain the current stage.",
      "Why is the risk high?",
      "What should be reviewed next?",
    ];
  }
  
  if (context.parcelId || context.ulpin) {
    return [
      "Explain this parcel.",
      "What case is linked to this parcel?",
      "What is the acquisition status?",
    ];
  }
  
  if (context.page === "dashboard") {
    return [
      "What needs attention today?",
      "Which stages are causing delays?",
      "Summarize current risks.",
      "Show delayed cases.",
    ];
  }
  
  return [
    "What needs attention today?",
    "Show delayed cases.",
    "Explain current bottlenecks.",
    "Find a parcel by ULPIN.",
    "Summarize my notifications.",
  ];
}
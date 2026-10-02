import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FileX2 } from "lucide-react";
import { CaseHeader } from "../../components/case/CaseHeader";
import { StageWorkflow } from "../../components/case/StageWorkflow";
import { CaseTimeline } from "../../components/case/CaseTimeline";
import { DocumentVault } from "../../components/case/DocumentVault";
import { RiskScorePanel } from "../../components/case/RiskScorePanel";
import { IntelligencePanel } from "../../components/intelligence/IntelligencePanel";
import { ResolutionPanel, type ResolutionDraft } from "../../components/intelligence/ResolutionPanel";
import { LoadingBlock, ErrorBlock } from "../../components/ui/AsyncState";
import { PlaceholderPage } from "../PlaceholderPage";
import { useApi } from "../../hooks/useApi";
import { useAIChat } from "../../hooks/useAIChat";
import { apiGet, apiPut, apiPost, ApiRequestError } from "../../services/apiClient";
import { buildTimeline } from "../../utils/timeline";
import { useAuth } from "../../features/auth/useAuth";
import type { CaseStatus, RiskLevel } from "../../types";
import type { ApiCase, ApiDocument, ApiRiskScore, ApiStage } from "../../types/api";
import type { CaseIntelligence, CaseResolution } from "../../types/intelligence";

const OFFICER_ROLES = ["super_admin", "dolr_officer", "state_officer", "district_officer"];
/** Only these roles may confirm that a resolution actually worked. Mirrors the backend guard. */
const VERIFIER_ROLES = ["super_admin", "state_officer"];

export function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { user } = useAuth();
  const isOfficer = user ? OFFICER_ROLES.includes(user.role) : false;
  const { setContext } = useAIChat();

  const caseQuery = useApi(() => apiGet<ApiCase>(`/cases/${caseId}`), [caseId]);
  const stagesQuery = useApi(() => apiGet<ApiStage[]>(`/cases/${caseId}/stages`), [caseId]);
  const documentsQuery = useApi(() => apiGet<ApiDocument[]>(`/cases/${caseId}/documents`), [caseId]);
  // Officer-only on the backend (decision-support data) — only call it if the signed-in user can actually see it.
  const riskQuery = useApi(
    () => (isOfficer ? apiGet<ApiRiskScore>(`/cases/${caseId}/risk-score`) : Promise.resolve(null)),
    [caseId, isOfficer],
  );

  // Intelligence is safe to request for any role: the backend scopes it to the
  // case, denies out-of-district access, and redacts money for landowners.
  // A 403/404 here must not take down the rest of the page.
  const intelligenceQuery = useApi(
    () => apiGet<CaseIntelligence>(`/intelligence/cases/${caseId}`).catch((e: unknown) => {
      if (e instanceof ApiRequestError && (e.status === 403 || e.status === 404)) return null;
      throw e;
    }),
    [caseId],
  );
  const resolutionsQuery = useApi(
    () => apiGet<CaseResolution[]>(`/intelligence/cases/${caseId}/resolutions`).catch(() => [] as CaseResolution[]),
    [caseId],
  );

  const canRecord = isOfficer;
  const canVerify = user ? VERIFIER_ROLES.includes(user.role) : false;

  // Publish page context to the shared Copilot store. The Copilot panel itself
  // is rendered once in the dashboard topbar, so the backend receives this
  // case id (and its human-readable number) with every question asked here.
  const resolvedCaseNumber = caseQuery.data?.caseNumber;
  const resolvedCaseId = caseQuery.data?.id ?? caseId;
  useEffect(() => {
    setContext({
      page: "case-details",
      caseId: resolvedCaseId,
      caseNumber: resolvedCaseNumber,
    });
  }, [setContext, resolvedCaseId, resolvedCaseNumber]);

  const loading = caseQuery.loading || stagesQuery.loading || documentsQuery.loading;

  if (!caseId) {
    return (
      <PlaceholderPage icon={FileX2} title="Case not found" description="No case ID was provided in the URL." />
    );
  }

  if (loading) {
    return <LoadingBlock label="Loading case…" />;
  }

  if (caseQuery.errorStatus === 404) {
    return (
      <PlaceholderPage
        icon={FileX2}
        title="Case not found"
        description="This acquisition case doesn't exist. Return to Acquisition Cases and pick one from the list."
      />
    );
  }

  if (caseQuery.error || stagesQuery.error || documentsQuery.error) {
    return (
      <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
        <ErrorBlock
          message={caseQuery.error ?? stagesQuery.error ?? documentsQuery.error ?? "Something went wrong."}
          onRetry={() => {
            caseQuery.refetch();
            stagesQuery.refetch();
            documentsQuery.refetch();
          }}
        />
      </div>
    );
  }

  if (!caseQuery.data || !stagesQuery.data || !documentsQuery.data) {
    return <LoadingBlock />;
  }

  async function updateCase(patch: { status?: CaseStatus; riskLevel?: RiskLevel }) {
    setSaving(true);
    setSaveError(null);
    try {
      await apiPut(`/cases/${caseId}`, patch);
      caseQuery.refetch();
    } catch (err) {
      setSaveError(err instanceof ApiRequestError ? err.message : "Could not update the case.");
    } finally {
      setSaving(false);
    }
  }

  async function recordResolution(draft: ResolutionDraft) {
    if (!caseId) return;
    await apiPost(`/intelligence/cases/${caseId}/resolutions`, draft);
    resolutionsQuery.refetch();
  }

  async function transitionResolution(
    resolution: CaseResolution,
    action: "submit" | "start_review" | "verify" | "reject",
    reason?: string,
  ) {
    await apiPost(`/intelligence/resolutions/${resolution.id}/${action}`, reason ? { reason } : undefined);
    // Verification changes what future cases will match against, so the
    // precedent panel has to be re-read too, not just the resolution list.
    resolutionsQuery.refetch();
    intelligenceQuery.refetch();
  }

  const timeline = buildTimeline(caseQuery.data, stagesQuery.data);

  return (
    <>
      <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
        <CaseHeader
          acquisitionCase={caseQuery.data}
          saving={saving}
          onStatusChange={(status) => updateCase({ status })}
          onRiskChange={(riskLevel) => updateCase({ riskLevel })}
        />

        {saveError && (
          <p role="alert" className="mt-3 border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
            {saveError}
          </p>
        )}

        <div className="mt-8 space-y-6">
          {intelligenceQuery.data && <IntelligencePanel analysis={intelligenceQuery.data} />}

          {intelligenceQuery.loading && (
            <div className="border border-hairline bg-white p-6">
              <p className="text-sm text-ink-soft">Analysing this case…</p>
            </div>
          )}

          <ResolutionPanel
            resolutions={resolutionsQuery.data ?? []}
            currentStage={intelligenceQuery.data?.currentStage ?? 1}
            suggestedProblemType={intelligenceQuery.data?.primaryBlocker?.type}
            canRecord={canRecord}
            canVerify={canVerify}
            currentUserId={user?.id ?? null}
            onRefresh={() => {
              resolutionsQuery.refetch();
              intelligenceQuery.refetch();
            }}
            onSubmitDraft={recordResolution}
            onTransition={transitionResolution}
          />

          {isOfficer && riskQuery.data && (
            <RiskScorePanel riskScore={riskQuery.data} onRecompute={riskQuery.refetch} recomputing={riskQuery.loading} />
          )}
          <StageWorkflow stages={stagesQuery.data} />
          <CaseTimeline timeline={timeline} />
          <DocumentVault documents={documentsQuery.data} />
        </div>
      </div>
    </>
  );
}

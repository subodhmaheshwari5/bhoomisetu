import { useEffect } from "react";
import { FileStack, Activity, Clock, Banknote, AlertOctagon, CheckCircle2 } from "lucide-react";
import { StatCard } from "../../components/ui/StatCard";
import { DemoTag } from "../../components/ui/DemoTag";
import { LoadingBlock, ErrorBlock } from "../../components/ui/AsyncState";
import { PriorityAlertsPanel } from "../../components/dashboard/PriorityAlertsPanel";
import { StageDistributionChart } from "../../components/dashboard/StageDistributionChart";
import { DistrictPerformanceChart } from "../../components/dashboard/DistrictPerformanceChart";
import { CaseStatusChart } from "../../components/dashboard/CaseStatusChart";
import { BottleneckChart } from "../../components/dashboard/BottleneckChart";
import { AlertScanButton } from "../../components/dashboard/AlertScanButton";
import { useApi } from "../../hooks/useApi";
import { useAIChat } from "../../hooks/useAIChat";
import { apiGet } from "../../services/apiClient";
import { useAuth } from "../../features/auth/useAuth";
import type { ApiAnalytics, ApiDashboard } from "../../types/api";

const ADMIN_ROLES = ["super_admin", "dolr_officer"];

export function OverviewPage() {
  const { user } = useAuth();
  const isAdmin = user ? ADMIN_ROLES.includes(user.role) : false;
  const dashboard = useApi(() => apiGet<ApiDashboard>("/dashboard"), []);
  const analytics = useApi(() => apiGet<ApiAnalytics>("/analytics"), []);
  const { setContext } = useAIChat();

  // Tell the shared Copilot store which page the user is on.
  useEffect(() => {
    setContext({ page: "dashboard" });
  }, [setContext]);

  const loading = dashboard.loading || analytics.loading;
  const error = dashboard.error ?? analytics.error;

  return (
    <>
      <div className="mx-auto max-w-(--container-content) px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl text-navy-950">BhoomiSetu Dashboard</h1>
            <p className="mt-1 text-sm text-ink-soft">National Land Acquisition Monitoring</p>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && <AlertScanButton onScanComplete={() => dashboard.refetch()} />}
            <DemoTag label="Live data · demo dataset" />
          </div>
        </div>

        {loading && <LoadingBlock label="Loading dashboard…" />}

        {!loading && error && (
          <div className="mt-6">
            <ErrorBlock
              message={error}
              onRetry={() => {
                dashboard.refetch();
                analytics.refetch();
              }}
            />
          </div>
        )}

        {!loading && !error && dashboard.data && analytics.data && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Total Cases" value={dashboard.data.kpi.totalCases} icon={FileStack} />
              <StatCard label="Active Acquisitions" value={dashboard.data.kpi.activeAcquisitions} icon={Activity} />
              <StatCard label="Pending Approvals" value={dashboard.data.kpi.pendingApprovals} icon={Clock} />
              <StatCard
                label="Compensation Pending"
                value={dashboard.data.kpi.compensationPending}
                icon={Banknote}
                tone="warning"
              />
              <StatCard label="Delayed Cases" value={dashboard.data.kpi.delayedCases} icon={AlertOctagon} tone="danger" />
              <StatCard label="Completed Cases" value={dashboard.data.kpi.completedCases} icon={CheckCircle2} />
            </div>

            <div className="mt-8">
              <PriorityAlertsPanel alerts={dashboard.data.priorityAlerts} />
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <StageDistributionChart data={analytics.data.stageDistribution} />
              <DistrictPerformanceChart data={analytics.data.districtPerformance} />
            </div>

            <div className="mt-6">
              <CaseStatusChart data={analytics.data.caseStatus} />
            </div>

            <div className="mt-6">
              <BottleneckChart data={analytics.data.bottlenecks} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

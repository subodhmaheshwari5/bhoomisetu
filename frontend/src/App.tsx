import { Routes, Route } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { LandownerPortalPage } from "./pages/LandownerPortalPage";
import { LoginPage } from "./pages/LoginPage";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { OverviewPage } from "./pages/dashboard/OverviewPage";
import { LandMapPage } from "./pages/dashboard/LandMapPage";
import { CaseListPage } from "./pages/dashboard/CaseListPage";
import { CaseDetailPage } from "./pages/dashboard/CaseDetailPage";
import { CompensationPage } from "./pages/dashboard/CompensationPage";
import { GrievancesPage } from "./pages/dashboard/GrievancesPage";
import { ReportsPage } from "./pages/dashboard/ReportsPage";
import { AnalyticsPage } from "./pages/dashboard/AnalyticsPage";
import { DocumentsPage } from "./pages/dashboard/DocumentsPage";
import { RehabilitationPage } from "./pages/dashboard/RehabilitationPage";
import { NotificationsPage } from "./pages/dashboard/NotificationsPage";
import { ProjectsPage } from "./pages/dashboard/admin/ProjectsPage";
import { AdminUsersPage } from "./pages/dashboard/admin/AdminUsersPage";
import { AdminStatesPage } from "./pages/dashboard/admin/AdminStatesPage";
import { AdminDistrictsPage } from "./pages/dashboard/admin/AdminDistrictsPage";
import { AdminSettingsPage } from "./pages/dashboard/admin/AdminSettingsPage";
import { AdminAuditLogsPage } from "./pages/dashboard/admin/AdminAuditLogsPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { RequireAuth } from "./features/auth/RequireAuth";
import { RequireRole } from "./features/auth/RequireRole";
import { ADMIN_ROLES } from "./data/authData";
import {
  GOVERNMENT_DASHBOARD_NAV,
  ADMINISTRATION_NAV,
} from "./components/layout/navConfig";

const BUILT_PATHS = [
  "/dashboard",
  "/dashboard/map",
  "/dashboard/cases",
  "/dashboard/compensation",
  "/dashboard/grievances",
  "/dashboard/reports",
  "/dashboard/analytics",
  "/dashboard/documents",
  "/dashboard/rehabilitation",
  "/dashboard/notifications",
  "/dashboard/admin/projects",
  "/dashboard/admin/users",
  "/dashboard/admin/states",
  "/dashboard/admin/districts",
  "/dashboard/admin/settings",
  "/dashboard/admin/audit-logs",
];
const ADMIN_PATHS = new Set(ADMINISTRATION_NAV.map((item) => item.path));

function App() {
  const stubNavItems = [...GOVERNMENT_DASHBOARD_NAV, ...ADMINISTRATION_NAV].filter(
    (item) => !BUILT_PATHS.includes(item.path),
  );

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/landowner" element={<LandownerPortalPage />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardLayout />
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="map" element={<LandMapPage />} />
        <Route path="cases" element={<CaseListPage />} />
        <Route path="cases/:caseId" element={<CaseDetailPage />} />
        <Route path="compensation" element={<CompensationPage />} />
        <Route path="grievances" element={<GrievancesPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="rehabilitation" element={<RehabilitationPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route
          path="admin/projects"
          element={
            <RequireRole roles={ADMIN_ROLES}>
              <ProjectsPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/users"
          element={
            <RequireRole roles={ADMIN_ROLES}>
              <AdminUsersPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/states"
          element={
            <RequireRole roles={ADMIN_ROLES}>
              <AdminStatesPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/districts"
          element={
            <RequireRole roles={ADMIN_ROLES}>
              <AdminDistrictsPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/settings"
          element={
            <RequireRole roles={ADMIN_ROLES}>
              <AdminSettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/audit-logs"
          element={
            <RequireRole roles={ADMIN_ROLES}>
              <AdminAuditLogsPage />
            </RequireRole>
          }
        />
        {stubNavItems.map((item) => {
          const page = <PlaceholderPage icon={item.icon} title={item.label} />;
          return (
            <Route
              key={item.path}
              path={item.path.replace("/dashboard/", "")}
              element={
                ADMIN_PATHS.has(item.path) ? (
                  <RequireRole roles={ADMIN_ROLES}>{page}</RequireRole>
                ) : (
                  page
                )
              }
            />
          );
        })}
      </Route>

      <Route
        path="*"
        element={
          <PlaceholderPage
            title="Page not found"
            description="The page you're looking for doesn't exist in this prototype."
          />
        }
      />
    </Routes>
  );
}

export default App;

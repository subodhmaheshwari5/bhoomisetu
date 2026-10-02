// -----------------------------------------------------------------------
// AUTH DATA — BhoomiSetu prototype
//
// There is no backend yet (that's Phase 6), so "authentication" here is a
// frontend-only simulation against a fixed list of demo accounts. Every
// password is a development-only dummy value, never a real credential.
// Real JWT-based auth with server-side authorization is built in Phase 6;
// this establishes the role model and route-guarding pattern the backend
// will plug into.
// -----------------------------------------------------------------------

import type { UserRole } from "../types";

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  dolr_officer: "DoLR Officer",
  state_officer: "State Officer",
  district_officer: "District Officer",
  landowner: "Landowner",
  land_agency: "Land-Requiring Agency",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: "Full system access.",
  dolr_officer: "National monitoring.",
  state_officer: "State-level cases.",
  district_officer: "District-level workflow.",
  landowner: "Only own parcel/case information.",
  land_agency: "Create and monitor project-related cases.",
};

// Roles permitted to view the Administration section of the dashboard
// (Users, States, Districts, Projects, System Settings, Audit Logs).
export const ADMIN_ROLES: UserRole[] = ["super_admin", "dolr_officer"];

const DUMMY_PASSWORD = "demo1234"; // development-only, not a real credential

export const DEMO_USERS: DemoUser[] = [
  { id: "u-admin", name: "System Administrator", email: "admin@bhoomisetu.demo", password: DUMMY_PASSWORD, role: "super_admin" },
  { id: "u-dolr", name: "Anjali Verma", email: "dolr.officer@bhoomisetu.demo", password: DUMMY_PASSWORD, role: "dolr_officer" },
  { id: "u-state", name: "Vikram Singh", email: "state.officer@bhoomisetu.demo", password: DUMMY_PASSWORD, role: "state_officer" },
  { id: "u-district", name: "Raj Kumar", email: "district.officer@bhoomisetu.demo", password: DUMMY_PASSWORD, role: "district_officer" },
  { id: "u-landowner", name: "Demo Landowner", email: "landowner@bhoomisetu.demo", password: DUMMY_PASSWORD, role: "landowner" },
  { id: "u-agency", name: "NHAI Project Office", email: "agency@bhoomisetu.demo", password: DUMMY_PASSWORD, role: "land_agency" },
];

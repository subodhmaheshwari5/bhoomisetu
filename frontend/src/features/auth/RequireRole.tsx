import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import type { UserRole } from "../../types";
import { ROLE_LABELS } from "../../data/authData";
import { PlaceholderPage } from "../../pages/PlaceholderPage";
import { useAuth } from "./useAuth";

export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(user.role)) {
    return (
      <PlaceholderPage
        icon={ShieldAlert}
        title="Access restricted"
        description={`This section is only available to: ${roles.map((r) => ROLE_LABELS[r]).join(", ")}. You're signed in as ${ROLE_LABELS[user.role]}.`}
      />
    );
  }

  return <>{children}</>;
}

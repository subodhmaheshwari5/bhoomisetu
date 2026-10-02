import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LoadingBlock } from "../../components/ui/AsyncState";
import { useAuth } from "./useAuth";

/** Redirects to /login if there's no session, preserving the intended destination. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingBlock label="Checking your session…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

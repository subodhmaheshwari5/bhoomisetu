import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiGet, apiPost, getStoredToken, setStoredToken, setUnauthorizedHandler, ApiRequestError } from "../../services/apiClient";
import type { AuthUser, LoginResponse } from "../../types/api";
import { AuthContext } from "./authContextBase";
import type { LoginResult } from "./authContextBase";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // No stored token means there's nothing to restore — start "loaded" rather
  // than flipping isLoading false synchronously inside the effect below.
  const [isLoading, setIsLoading] = useState(() => getStoredToken() !== null);

  // On first load, if a token was saved from a previous session, validate it
  // against the real backend (GET /api/auth/me) instead of trusting a cached
  // user object — an expired/invalid token should just log the user out.
  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    apiGet<AuthUser>("/auth/me")
      .then((me) => setUser(me))
      .catch(() => {
        setStoredToken(null);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setStoredToken(null);
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo(() => {
    async function login(email: string, password: string): Promise<LoginResult> {
      try {
        const { token, user: loggedInUser } = await apiPost<LoginResponse>("/auth/login", { email, password });
        setStoredToken(token);
        setUser(loggedInUser);
        return { ok: true };
      } catch (err) {
        const message = err instanceof ApiRequestError ? err.message : "Could not sign in. Please try again.";
        return { ok: false, error: message };
      }
    }

    function logout() {
      setStoredToken(null);
      setUser(null);
    }

    return { user, isAuthenticated: user !== null, isLoading, login, logout };
  }, [user, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

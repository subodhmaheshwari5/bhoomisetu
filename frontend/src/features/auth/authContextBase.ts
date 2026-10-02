import { createContext } from "react";
import type { AuthUser } from "../../types/api";

export type LoginResult = { ok: true } | { ok: false; error: string };

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True while restoring a session from a stored token on first load. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

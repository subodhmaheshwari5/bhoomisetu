import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { BhoomiSetuMark } from "../components/layout/BhoomiSetuMark";
import { DemoTag } from "../components/ui/DemoTag";
import { useAuth } from "../features/auth/useAuth";
import { DEMO_USERS, ROLE_DESCRIPTIONS, ROLE_LABELS } from "../data/authData";
import type { UserRole } from "../types";

function destinationFor(role: UserRole): string {
  return role === "landowner" || role === "land_agency" ? "/landowner" : "/dashboard";
}

export function LoginPage() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated && user) {
    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
    return <Navigate to={from ?? destinationFor(user.role)} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    const result = await login(email, password);
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
  }

  async function loginAs(demoEmail: string, demoPassword: string, role: UserRole) {
    setIsSubmitting(true);
    const result = await login(demoEmail, demoPassword);
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    navigate(destinationFor(role), { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper sm:flex-row">
      {/* Left: brand panel */}
      <div className="flex flex-col justify-between bg-navy-950 px-8 py-10 text-white sm:w-[40%] sm:px-12 sm:py-14">
        <Link to="/" className="flex items-center gap-2.5">
          <BhoomiSetuMark className="h-8 w-8" />
          <span className="font-display text-lg text-white">BhoomiSetu</span>
        </Link>

        <div className="mt-10 sm:mt-0">
          <p className="font-mono text-xs text-gold-400">SIH 2026 · PS ID 26016</p>
          <h1 className="mt-4 font-display text-3xl leading-tight text-white">
            Sign in to the acquisition monitoring platform
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-navy-100/70">
            Government officers, land-requiring agencies and administrators
            share one sign-in. Access to each section is scoped by role.
          </p>
        </div>

        <p className="hidden text-xs text-navy-100/40 sm:block">
          Prototype demonstration — authenticated against a real BhoomiSetu API, not a live directory or SSO.
        </p>
      </div>

      {/* Right: form + demo accounts */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-navy-950">Government Login</h2>
            <DemoTag label="Demo accounts" />
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-ink-soft">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@bhoomisetu.demo"
                className="mt-1 w-full border border-hairline bg-white px-3 py-2.5 text-sm text-ink placeholder:text-slate focus:border-navy-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-ink-soft">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full border border-hairline bg-white px-3 py-2.5 text-sm text-ink placeholder:text-slate focus:border-navy-500 focus:outline-none"
              />
            </div>

            {error && (
              <p role="alert" className="border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" strokeWidth={1.75} />
              {isSubmitting ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div className="mt-8 border-t border-hairline pt-6">
            <p className="font-mono text-[11px] tracking-wide text-slate">Demo accounts (dev-only passwords)</p>
            <ul className="mt-3 space-y-2">
              {DEMO_USERS.map((demoUser) => (
                <li key={demoUser.id}>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => loginAs(demoUser.email, demoUser.password, demoUser.role)}
                    className="flex w-full items-center justify-between gap-3 border border-hairline bg-white px-3 py-2.5 text-left hover:bg-paper-dim disabled:opacity-60"
                  >
                    <span>
                      <span className="block text-sm text-navy-950">{ROLE_LABELS[demoUser.role]}</span>
                      <span className="block text-xs text-ink-soft">{ROLE_DESCRIPTIONS[demoUser.role]}</span>
                    </span>
                    <span className="font-mono text-[11px] text-slate">{demoUser.email}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate">
              Password for every demo account: <span className="font-mono">demo1234</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

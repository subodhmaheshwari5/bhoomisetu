import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, X, LogOut } from "lucide-react";
import { BhoomiSetuMark } from "./BhoomiSetuMark";
import { useAuth } from "../../features/auth/useAuth";

const LINKS = [
  { label: "Platform", href: "#solution" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Why BhoomiSetu", href: "#why" },
];

function destinationFor(role: string): string {
  return role === "landowner" || role === "land_agency" ? "/landowner" : "/dashboard";
}

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    setOpen(false);
    navigate("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-(--container-content) items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <BhoomiSetuMark className="h-8 w-8" />
          <span className="font-display text-lg tracking-tight text-navy-950">BhoomiSetu</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-ink-soft transition-colors hover:text-navy-950"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated && user ? (
            <>
              <Link
                to={destinationFor(user.role)}
                className="text-sm text-ink-soft transition-colors hover:text-navy-950"
              >
                {user.name}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 bg-navy-900 px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-navy-800"
              >
                <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/landowner"
                className="text-sm text-ink-soft transition-colors hover:text-navy-950"
              >
                Landowner Portal
              </Link>
              <Link
                to="/login"
                className="bg-navy-900 px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-navy-800"
              >
                Government Login
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="grid h-9 w-9 place-items-center border border-hairline text-navy-900 md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-hairline bg-paper px-5 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-sm px-2 py-2.5 text-sm text-ink-soft hover:bg-paper-dim"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            {isAuthenticated && user ? (
              <>
                <Link
                  to={destinationFor(user.role)}
                  className="rounded-sm px-2 py-2.5 text-sm text-ink-soft hover:bg-paper-dim"
                  onClick={() => setOpen(false)}
                >
                  {user.name}
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-2 flex items-center justify-center gap-1.5 bg-navy-900 px-4 py-2.5 text-center text-sm font-medium text-paper"
                >
                  <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/landowner"
                  className="rounded-sm px-2 py-2.5 text-sm text-ink-soft hover:bg-paper-dim"
                  onClick={() => setOpen(false)}
                >
                  Landowner Portal
                </Link>
                <Link
                  to="/login"
                  className="mt-2 bg-navy-900 px-4 py-2.5 text-center text-sm font-medium text-paper"
                  onClick={() => setOpen(false)}
                >
                  Government Login
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

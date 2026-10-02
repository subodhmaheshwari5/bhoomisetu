import type { ReactNode } from "react";
import { PublicHeader } from "../components/layout/PublicHeader";
import { PublicFooter } from "../components/layout/PublicFooter";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

"use client";

import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Logomark } from "@/components/icons";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/analytics", label: "Analytics" },
] as const;

export function AppHeader({ session, active }: { session: Session; active: "/" | "/analytics" }) {
  return (
    <header className="app-header">
      <div className="brand brand-row">
        <Logomark size={36} />
        <div>
          <h1>jobfit</h1>
          <p className="tagline">Executive shortlist</p>
        </div>
      </div>
      <nav className="app-nav">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={active === link.href ? "app-nav-link active" : "app-nav-link"}>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="header-actions">
        <span className="user-email">{session.user.email}</span>
        <button className="ghost" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Logomark, SparkleIcon } from "@/components/icons";
import { NotificationBell } from "@/components/NotificationBell";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/jobs", label: "Browse jobs" },
  { href: "/tracker", label: "Tracker" },
  { href: "/interviews", label: "Interviews" },
  { href: "/networking", label: "Networking" },
  { href: "/resume", label: "Resume" },
  { href: "/analytics", label: "Analytics" },
] as const;

export type ActiveRoute = (typeof NAV_LINKS)[number]["href"];

export function AppHeader({ session, active }: { session: Session; active: ActiveRoute }) {
  return (
    <header className="app-header">
      <div className="app-header-top">
        <div className="brand brand-row">
          <Logomark size={32} />
          <h1 style={{ fontSize: "1.1rem" }}>jobfit</h1>
          <span className="badge badge-accent icon-btn" style={{ padding: "0.2rem 0.6rem" }}>
            <SparkleIcon size={11} />
            AI
          </span>
        </div>
        <div className="header-actions">
          <NotificationBell session={session} />
          <span className="user-email">{session.user.email}</span>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
      <nav className="app-nav">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={active === link.href ? "app-nav-link active" : "app-nav-link"}>
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

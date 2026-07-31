"use client";

import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { ChatBubbleIcon, Logomark, SparkleIcon } from "@/components/icons";
import { NotificationBell } from "@/components/NotificationBell";
import { ASSISTANT_OPEN_EVENT, ASSISTANT_OPEN_KEY } from "@/lib/useAssistantOpen";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/tracker", label: "Tracker" },
  { href: "/jobs", label: "Browse jobs" },
  { href: "/auto-apply", label: "Auto Apply" },
  { href: "/interviews", label: "Interviews" },
  { href: "/networking", label: "Networking" },
  { href: "/resume", label: "Resume" },
  { href: "/analytics", label: "Analytics" },
  { href: "/profile", label: "Profile" },
] as const;

// "/admin" is intentionally not in NAV_LINKS — no public nav item should
// advertise the admin page to every signed-in user. It's still a valid
// value here so the admin page itself can render AppHeader without a type
// error; verifyAdmin (lib/adminAuth.ts) is the real access gate, not this.
export type ActiveRoute = (typeof NAV_LINKS)[number]["href"] | "/admin";

function openAssistant() {
  localStorage.setItem(ASSISTANT_OPEN_KEY, "1");
  window.dispatchEvent(new Event(ASSISTANT_OPEN_EVENT));
}

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
          <span key={link.href} className="app-nav-item">
            {link.href === "/auto-apply" && <span className="app-nav-badge">NEW</span>}
            <Link href={link.href} className={active === link.href ? "app-nav-link active" : "app-nav-link"}>
              {link.label}
            </Link>
          </span>
        ))}
      </nav>
      <Link
        href="/"
        className="support-bubble"
        aria-label="Chat with the jobfit Assistant"
        title="Chat with the jobfit Assistant"
        onClick={openAssistant}
      >
        <ChatBubbleIcon size={20} />
      </Link>
    </header>
  );
}

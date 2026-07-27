"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { MATCHES_SELECT, MatchedJobRow, ResumeVersion } from "@/lib/types";
import { ActivityRow } from "@/lib/activityDescribe";
import { SignIn } from "@/components/SignIn";
import { AppHeader } from "@/components/AppHeader";
import { AnalyticsView } from "@/components/AnalyticsView";
import { Logomark } from "@/components/icons";

// Per-user (auth session, matches, activity history) — never static, and
// avoids the Supabase client being constructed at build time.
export const dynamic = "force-dynamic";

export default function Analytics() {
  const { session, loadingSession } = useSession();
  const [matches, setMatches] = useState<MatchedJobRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [resumeVersions, setResumeVersions] = useState<ResumeVersion[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!session) return;
    setLoadingData(true);

    Promise.all([
      supabase.from("matches").select(MATCHES_SELECT).order("fit_score", { ascending: false }),
      supabase
        .from("activity_log")
        .select("id, entity_type, entity_id, action, metadata, created_at")
        .eq("user_id", session.user.id)
        .eq("entity_type", "application")
        .eq("action", "status_changed")
        .order("created_at", { ascending: true }),
      supabase.from("resume_versions").select("*"),
    ]).then(([matchesRes, activityRes, versionsRes]) => {
      setMatches((matchesRes.data as unknown as MatchedJobRow[]) ?? []);
      setActivity((activityRes.data as ActivityRow[]) ?? []);
      setResumeVersions((versionsRes.data as ResumeVersion[]) ?? []);
      setLoadingData(false);
    });
  }, [session]);

  if (loadingSession) {
    return (
      <main className="container center-page">
        <div className="skeleton-spinner" aria-label="Loading" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="container center-page">
        <div>
          <div className="brand brand-centered" style={{ marginBottom: "1.5rem" }}>
            <Logomark size={40} />
            <h1>jobfit</h1>
            <p className="tagline">Fewer, better, real job matches.</p>
          </div>
          <SignIn />
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <AppHeader session={session} active="/analytics" />

      {loadingData ? (
        <div className="stat-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="stat-tile skeleton-tile" key={i} />
          ))}
        </div>
      ) : (
        <AnalyticsView
          matches={matches}
          activity={activity}
          defaultResumeVersion={resumeVersions.find((v) => v.is_default)}
        />
      )}
    </main>
  );
}

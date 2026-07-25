"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { MatchedJobRow } from "@/lib/types";
import { SignIn } from "@/components/SignIn";
import { ResumeForm } from "@/components/ResumeForm";
import { MatchesTable } from "@/components/MatchesTable";
import { StatTile } from "@/components/StatTile";

// This page is inherently per-user (auth session, resume, matches) — never
// static. Also avoids the Supabase client being constructed at build time,
// when real env vars aren't necessarily present yet.
export const dynamic = "force-dynamic";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [resumeText, setResumeText] = useState("");
  const [matches, setMatches] = useState<MatchedJobRow[]>([]);
  // Starts true (not false) so ResumeForm never mounts with a stale empty
  // initialText before the fetch below resolves — its internal textarea
  // state only initializes once, from its first-render props.
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;

    setLoadingData(true);

    Promise.all([
      supabase
        .from("resumes")
        .select("resume_text")
        .eq("user_id", session.user.id)
        .maybeSingle(),
      supabase
        .from("matches")
        .select("fit_score, missing_skills, reasons, status, jobs(title, company, location, apply_url, posted_at)")
        .order("fit_score", { ascending: false }),
    ]).then(([resumeRes, matchesRes]) => {
      setResumeText(resumeRes.data?.resume_text ?? "");
      setMatches((matchesRes.data as unknown as MatchedJobRow[]) ?? []);
      setLoadingData(false);
    });
  }, [session]);

  const stats = useMemo(() => {
    if (matches.length === 0) return null;

    const avgFit = matches.reduce((sum, m) => sum + m.fit_score, 0) / matches.length;
    const top = matches[0];
    const companies = new Set(matches.map((m) => m.jobs?.company).filter(Boolean));

    return {
      count: matches.length,
      avgFit: Math.round(avgFit * 100),
      topFit: Math.round(top.fit_score * 100),
      topTitle: top.jobs?.title ?? "",
      topCompany: top.jobs?.company ?? "",
      companyCount: companies.size,
    };
  }, [matches]);

  if (loadingSession) {
    return <main className="container center-page">Loading...</main>;
  }

  if (!session) {
    return (
      <main className="container center-page">
        <div>
          <div className="brand" style={{ textAlign: "center", marginBottom: "1.5rem" }}>
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
      <header className="app-header">
        <div className="brand">
          <h1>jobfit</h1>
          <p className="tagline">Executive shortlist</p>
        </div>
        <div className="header-actions">
          <span className="user-email">{session.user.email}</span>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {stats && (
        <div className="stat-grid">
          <StatTile label="Shortlist size" value={String(stats.count)} subtitle="active matches" />
          <StatTile label="Avg. fit" value={`${stats.avgFit}%`} subtitle={`across ${stats.count} roles`} />
          <StatTile
            label="Top match"
            value={`${stats.topFit}%`}
            subtitle={`${stats.topTitle} · ${stats.topCompany}`}
          />
          <StatTile label="Companies" value={String(stats.companyCount)} subtitle="represented in shortlist" />
        </div>
      )}

      {loadingData ? (
        <div className="card">
          <p className="hint" style={{ margin: 0 }}>
            Loading your resume...
          </p>
        </div>
      ) : (
        <ResumeForm userId={session.user.id} initialText={resumeText} />
      )}

      <div className="card">
        <h2 style={{ marginBottom: "1rem" }}>Your shortlist</h2>
        {loadingData ? <p className="hint">Loading matches...</p> : <MatchesTable matches={matches} />}
      </div>
    </main>
  );
}

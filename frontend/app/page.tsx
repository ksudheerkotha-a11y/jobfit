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

// Quick presets on top of the free-text location filter — substring match
// against the job's location string, so e.g. "Remote" also catches
// "Raleigh, NC / EST Remote".
const LOCATION_PRESETS = [
  { label: "All", value: "" },
  { label: "Remote", value: "remote" },
  { label: "India", value: "india" },
];

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [resumeText, setResumeText] = useState("");
  const [matches, setMatches] = useState<MatchedJobRow[]>([]);
  const [locationFilter, setLocationFilter] = useState("");
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

  const filteredMatches = useMemo(() => {
    const needle = locationFilter.trim().toLowerCase();
    if (!needle) return matches;
    return matches.filter((m) => m.jobs?.location?.toLowerCase().includes(needle));
  }, [matches, locationFilter]);

  const stats = useMemo(() => {
    if (filteredMatches.length === 0) return null;

    const avgFit = filteredMatches.reduce((sum, m) => sum + m.fit_score, 0) / filteredMatches.length;
    const top = filteredMatches[0];
    const companies = new Set(filteredMatches.map((m) => m.jobs?.company).filter(Boolean));

    return {
      count: filteredMatches.length,
      avgFit: Math.round(avgFit * 100),
      topFit: Math.round(top.fit_score * 100),
      topTitle: top.jobs?.title ?? "",
      topCompany: top.jobs?.company ?? "",
      companyCount: companies.size,
    };
  }, [filteredMatches]);

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <h2 style={{ margin: 0 }}>Your shortlist</h2>
          {matches.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              {LOCATION_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={locationFilter === preset.value ? "primary" : "ghost"}
                  style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }}
                  onClick={() => setLocationFilter(preset.value)}
                >
                  {preset.label}
                </button>
              ))}
              <input
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="Filter by location..."
                style={{ width: 180, padding: "0.3rem 0.6rem", fontSize: "0.8125rem" }}
              />
            </div>
          )}
        </div>
        {loadingData ? (
          <p className="hint">Loading matches...</p>
        ) : matches.length > 0 && filteredMatches.length === 0 ? (
          <p className="empty-state">No matches for "{locationFilter}". Try a different location or clear the filter.</p>
        ) : (
          <MatchesTable matches={filteredMatches} />
        )}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { MatchedJobRow, MatchStatus } from "@/lib/types";
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

const SORT_OPTIONS = [
  { label: "Best fit", value: "fit" },
  { label: "Company", value: "company" },
  { label: "Most recent", value: "recent" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [resumeText, setResumeText] = useState("");
  const [matches, setMatches] = useState<MatchedJobRow[]>([]);
  const [locationFilter, setLocationFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortValue>("fit");
  const [showDismissed, setShowDismissed] = useState(false);
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
        .select("job_id, fit_score, missing_skills, reasons, status, jobs(title, company, location, apply_url, posted_at, description)")
        .order("fit_score", { ascending: false }),
    ]).then(([resumeRes, matchesRes]) => {
      setResumeText(resumeRes.data?.resume_text ?? "");
      setMatches((matchesRes.data as unknown as MatchedJobRow[]) ?? []);
      setLoadingData(false);
    });
  }, [session]);

  async function handleStatusChange(jobId: string, status: MatchStatus) {
    if (!session) return;
    // Optimistic — the dashboard should feel instant; Supabase RLS still
    // guarantees this can only ever touch the caller's own row.
    setMatches((prev) => prev.map((m) => (m.job_id === jobId ? { ...m, status } : m)));
    await supabase
      .from("matches")
      .update({ status })
      .eq("job_id", jobId)
      .eq("user_id", session.user.id);
  }

  const dismissedCount = useMemo(() => matches.filter((m) => m.status === "dismissed").length, [matches]);

  const visibleMatches = useMemo(() => {
    let result = showDismissed ? matches : matches.filter((m) => m.status !== "dismissed");

    const needle = locationFilter.trim().toLowerCase();
    if (needle) {
      result = result.filter((m) => m.jobs?.location?.toLowerCase().includes(needle));
    }

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (m) =>
          m.jobs?.title?.toLowerCase().includes(query) ||
          m.jobs?.company?.toLowerCase().includes(query)
      );
    }

    const sorted = [...result];
    if (sortBy === "company") {
      sorted.sort((a, b) => (a.jobs?.company ?? "").localeCompare(b.jobs?.company ?? ""));
    } else if (sortBy === "recent") {
      sorted.sort((a, b) => (b.jobs?.posted_at ?? "").localeCompare(a.jobs?.posted_at ?? ""));
    } else {
      sorted.sort((a, b) => b.fit_score - a.fit_score);
    }
    return sorted;
  }, [matches, locationFilter, search, sortBy, showDismissed]);

  const stats = useMemo(() => {
    const active = matches.filter((m) => m.status !== "dismissed");
    if (active.length === 0) return null;

    const avgFit = active.reduce((sum, m) => sum + m.fit_score, 0) / active.length;
    const top = [...active].sort((a, b) => b.fit_score - a.fit_score)[0];
    const companies = new Set(active.map((m) => m.jobs?.company).filter(Boolean));
    const appliedCount = matches.filter((m) => m.status === "applied").length;

    return {
      count: active.length,
      avgFit: Math.round(avgFit * 100),
      topFit: Math.round(top.fit_score * 100),
      topTitle: top.jobs?.title ?? "",
      topCompany: top.jobs?.company ?? "",
      companyCount: companies.size,
      appliedCount,
    };
  }, [matches]);

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

      {loadingData ? (
        <div className="stat-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="stat-tile skeleton-tile" key={i} />
          ))}
        </div>
      ) : (
        stats && (
          <div className="stat-grid">
            <StatTile label="Shortlist size" value={String(stats.count)} subtitle="active matches" />
            <StatTile label="Avg. fit" value={`${stats.avgFit}%`} subtitle={`across ${stats.count} roles`} />
            <StatTile
              label="Top match"
              value={`${stats.topFit}%`}
              subtitle={`${stats.topTitle} · ${stats.topCompany}`}
            />
            <StatTile
              label="Companies"
              value={String(stats.companyCount)}
              subtitle={stats.appliedCount > 0 ? `${stats.appliedCount} applied` : "represented in shortlist"}
            />
          </div>
        )
      )}

      {loadingData ? (
        <div className="card">
          <div className="skeleton-line" style={{ width: "40%" }} />
          <div className="skeleton-line" style={{ width: "70%", marginTop: "0.5rem" }} />
        </div>
      ) : (
        <ResumeForm userId={session.user.id} initialText={resumeText} />
      )}

      <div className="card">
        <div className="shortlist-toolbar">
          <h2 style={{ margin: 0 }}>Your shortlist</h2>
          {matches.length > 0 && (
            <div className="toolbar-controls">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search role or company..."
                className="control-input"
              />
              <div className="preset-group">
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
              </div>
              <input
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="Filter by location..."
                className="control-input"
                style={{ width: 160 }}
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortValue)}
                className="control-input"
                style={{ width: 130 }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    Sort: {opt.label}
                  </option>
                ))}
              </select>
              {dismissedCount > 0 && (
                <button
                  type="button"
                  className="ghost"
                  style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }}
                  onClick={() => setShowDismissed((v) => !v)}
                >
                  {showDismissed ? "Hide dismissed" : `Show dismissed (${dismissedCount})`}
                </button>
              )}
            </div>
          )}
        </div>
        {loadingData ? (
          <div className="skeleton-table">
            {Array.from({ length: 4 }).map((_, i) => (
              <div className="skeleton-row" key={i} />
            ))}
          </div>
        ) : matches.length > 0 && visibleMatches.length === 0 ? (
          <p className="empty-state">
            No matches match your filters. Try a different search, location, or clear the filters.
          </p>
        ) : (
          <MatchesTable
            matches={visibleMatches}
            resumeText={resumeText}
            accessToken={session.access_token}
            onStatusChange={handleStatusChange}
          />
        )}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { APPLIED_STATUSES, Contact, MATCHES_SELECT, MatchedJobRow, MatchStatus, ResumeVersion } from "@/lib/types";
import { logActivity } from "@/lib/logActivity";
import { SignIn } from "@/components/SignIn";
import { AppHeader } from "@/components/AppHeader";
import { MatchesTable } from "@/components/MatchesTable";
import { KanbanBoard } from "@/components/KanbanBoard";
import { SearchIcon, Logomark } from "@/components/icons";

// Per-user (auth session, matches, contacts, resume) — never static.
export const dynamic = "force-dynamic";

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

export default function Tracker() {
  const { session, loadingSession } = useSession();
  const [matches, setMatches] = useState<MatchedJobRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [resumeVersions, setResumeVersions] = useState<ResumeVersion[]>([]);
  const [locationFilter, setLocationFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortValue>("fit");
  const [showDismissed, setShowDismissed] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table" | "board">("cards");
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setLoadingData(true);
    setLoadError(null);

    Promise.all([
      supabase.from("matches").select(MATCHES_SELECT).order("fit_score", { ascending: false }),
      supabase.from("contacts").select("id, name, company, context").order("name"),
      supabase.from("resume_versions").select("*"),
    ]).then(([matchesRes, contactsRes, versionsRes]) => {
      const err = matchesRes.error || contactsRes.error || versionsRes.error;
      if (err) setLoadError("Couldn't load your shortlist — try refreshing.");
      setMatches((matchesRes.data as unknown as MatchedJobRow[]) ?? []);
      setContacts((contactsRes.data as Contact[]) ?? []);
      setResumeVersions((versionsRes.data as ResumeVersion[]) ?? []);
      setLoadingData(false);
    });
  }, [session]);

  const defaultResumeVersion = useMemo(() => resumeVersions.find((v) => v.is_default), [resumeVersions]);
  const resumeText = defaultResumeVersion?.resume_text ?? "";

  async function handleStatusChange(jobId: string, status: MatchStatus) {
    if (!session) return;
    const existing = matches.find((m) => m.job_id === jobId);
    const appliedAt =
      existing?.applied_at ?? (APPLIED_STATUSES.includes(status) ? new Date().toISOString() : null);

    setMatches((prev) => prev.map((m) => (m.job_id === jobId ? { ...m, status, applied_at: appliedAt } : m)));

    const { error } = await supabase
      .from("matches")
      .update({ status, applied_at: appliedAt })
      .eq("job_id", jobId)
      .eq("user_id", session.user.id);

    if (error) {
      console.warn("Failed to update match status:", error.message);
      setMatches((prev) =>
        prev.map((m) => (m.job_id === jobId && existing ? { ...m, status: existing.status, applied_at: existing.applied_at } : m))
      );
      return;
    }

    if (existing && existing.status !== status) {
      logActivity(session.user.id, "application", jobId, "status_changed", {
        from: existing.status,
        to: status,
        company: existing.jobs?.company,
        title: existing.jobs?.title,
      });
    }
  }

  async function handleNotesChange(jobId: string, notes: string) {
    if (!session) return;
    const existing = matches.find((m) => m.job_id === jobId);
    setMatches((prev) => prev.map((m) => (m.job_id === jobId ? { ...m, notes } : m)));

    const { error } = await supabase.from("matches").update({ notes }).eq("job_id", jobId).eq("user_id", session.user.id);

    if (error) {
      console.warn("Failed to save notes:", error.message);
      setMatches((prev) => prev.map((m) => (m.job_id === jobId && existing ? { ...m, notes: existing.notes } : m)));
      return;
    }

    logActivity(session.user.id, "application", jobId, "note_added", {
      company: existing?.jobs?.company,
      title: existing?.jobs?.title,
    });
  }

  // Mirrors the legacy `resumes` table the Python matcher reads — see
  // /resume for the full rationale. Only touched here because saving a
  // tailored draft as a new (non-default) version never changes it.
  async function handleSaveTailoredResume(text: string, jobTitle: string, company: string) {
    if (!session) return;
    const title = `Tailored — ${jobTitle} @ ${company}`;
    const { data, error } = await supabase
      .from("resume_versions")
      .insert({
        user_id: session.user.id,
        title,
        resume_text: text,
        source_resume_id: defaultResumeVersion?.id ?? null,
        is_default: false,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    setResumeVersions((prev) => [data as ResumeVersion, ...prev]);
    logActivity(session.user.id, "resume", String((data as ResumeVersion).id), "resume_version_added", {
      title,
      tailored: true,
    });
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
        (m) => m.jobs?.title?.toLowerCase().includes(query) || m.jobs?.company?.toLowerCase().includes(query)
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
      <AppHeader session={session} active="/tracker" />

      {loadError && <p className="error">{loadError}</p>}

      <div className="card">
        <div className="shortlist-toolbar">
          <h2 style={{ margin: 0 }}>Your shortlist</h2>
          {matches.length > 0 && (
            <div className="filter-bar">
              <div className="preset-group">
                <button
                  type="button"
                  className={`filter-pill-btn ${viewMode === "cards" ? "primary" : "ghost"}`}
                  onClick={() => setViewMode("cards")}
                >
                  Cards
                </button>
                <button
                  type="button"
                  className={`filter-pill-btn ${viewMode === "table" ? "primary" : "ghost"}`}
                  onClick={() => setViewMode("table")}
                >
                  Table
                </button>
                <button
                  type="button"
                  className={`filter-pill-btn ${viewMode === "board" ? "primary" : "ghost"}`}
                  onClick={() => setViewMode("board")}
                >
                  Board
                </button>
              </div>
              <div className="search-input-wrap">
                <SearchIcon size={15} className="search-input-icon" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search role or company..."
                  className="control-input search-input pill-input"
                />
              </div>
              <div className="preset-group">
                {LOCATION_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={`filter-pill-btn ${locationFilter === preset.value ? "primary" : "ghost"}`}
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
                className="control-input pill-input"
                style={{ width: 160 }}
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortValue)}
                className="control-input pill-input"
                style={{ width: 140 }}
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
                  className="filter-pill-btn ghost"
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
        ) : matches.length === 0 ? (
          <p className="empty-state">
            No matches yet — the next scheduled ingest + match run (every 12h via GitHub Actions) will
            populate your shortlist here.
          </p>
        ) : visibleMatches.length === 0 ? (
          <p className="empty-state">
            No matches match your filters. Try a different search, location, or clear the filters.
          </p>
        ) : viewMode === "board" ? (
          <KanbanBoard
            matches={visibleMatches}
            userId={session.user.id}
            contacts={contacts}
            onStatusChange={handleStatusChange}
          />
        ) : (
          <MatchesTable
            matches={visibleMatches}
            resumeText={resumeText}
            accessToken={session.access_token}
            userId={session.user.id}
            contacts={contacts}
            layout={viewMode === "cards" ? "cards" : "table"}
            onStatusChange={handleStatusChange}
            onNotesChange={handleNotesChange}
            onSaveTailoredResume={handleSaveTailoredResume}
          />
        )}
      </div>
    </main>
  );
}

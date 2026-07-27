"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { APPLIED_STATUSES, Contact, Interview, JobRow, MATCHES_SELECT, MatchedJobRow, MatchStatus, ResumeVersion, SavedJob } from "@/lib/types";
import Link from "next/link";
import { SignIn } from "@/components/SignIn";
import { AppHeader } from "@/components/AppHeader";
import { ResumeCenter } from "@/components/ResumeCenter";
import { MatchesTable } from "@/components/MatchesTable";
import { StatTile } from "@/components/StatTile";
import { ContactsManager } from "@/components/ContactsManager";
import {
  ActivityIcon,
  BellIcon,
  CalendarIcon,
  CheckCircleIcon,
  ListIcon,
  Logomark,
  SearchIcon,
  SparkleIcon,
  TargetIcon,
  TrendingUpIcon,
  TrophyIcon,
} from "@/components/icons";
import { BrowseMatches } from "@/components/BrowseMatches";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { logActivity } from "@/lib/logActivity";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ApplicationsChart } from "@/components/ApplicationsChart";
import { JobSearch } from "@/components/JobSearch";
import { SavedJobs } from "@/components/SavedJobs";
import { KanbanBoard } from "@/components/KanbanBoard";

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

const SAVED_JOBS_SELECT =
  "id, job_id, created_at, jobs(id, title, company, location, description, apply_url, posted_at)";

export default function Home() {
  const { session, loadingSession } = useSession();
  const [resumeVersions, setResumeVersions] = useState<ResumeVersion[]>([]);
  const [matches, setMatches] = useState<MatchedJobRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [upcomingInterviews, setUpcomingInterviews] = useState<Interview[]>([]);
  const [locationFilter, setLocationFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortValue>("fit");
  const [showDismissed, setShowDismissed] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "board">("table");
  // Starts true (not false) so the dashboard renders its loading skeleton
  // rather than an empty state before the fetch below resolves.
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!session) return;

    setLoadingData(true);

    Promise.all([
      supabase.from("resumes").select("resume_text").eq("user_id", session.user.id).maybeSingle(),
      supabase.from("resume_versions").select("*").order("created_at", { ascending: false }),
      supabase.from("matches").select(MATCHES_SELECT).order("fit_score", { ascending: false }),
      supabase.from("contacts").select("id, name, company, context").order("name"),
      supabase.from("saved_jobs").select(SAVED_JOBS_SELECT).order("created_at", { ascending: false }),
      supabase
        .from("interviews")
        .select("*")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(3),
    ]).then(async ([legacyResumeRes, versionsRes, matchesRes, contactsRes, savedJobsRes, interviewsRes]) => {
      let versions = (versionsRes.data as ResumeVersion[]) ?? [];

      // One-time backfill: users from before Phase 5 have their resume only
      // in the legacy `resumes` table. Give them a matching default version
      // instead of starting the Resume Center empty.
      const legacyText = legacyResumeRes.data?.resume_text ?? "";
      if (versions.length === 0 && legacyText.trim()) {
        const { data: migrated } = await supabase
          .from("resume_versions")
          .insert({ user_id: session.user.id, title: "My resume", resume_text: legacyText, is_default: true })
          .select("*")
          .single();
        if (migrated) versions = [migrated as ResumeVersion];
      }

      setResumeVersions(versions);
      setMatches((matchesRes.data as unknown as MatchedJobRow[]) ?? []);
      setContacts((contactsRes.data as Contact[]) ?? []);
      setSavedJobs((savedJobsRes.data as unknown as SavedJob[]) ?? []);
      setUpcomingInterviews((interviewsRes.data as Interview[]) ?? []);
      setLoadingData(false);
    });
  }, [session]);

  // The legacy `resumes` table is what the Python matcher still reads —
  // keep it mirrored to whichever version is default so scoring never
  // requires touching the ingestion pipeline (see README / Phase 1 decision).
  async function syncLegacyResume(text: string) {
    if (!session) return;
    await supabase
      .from("resumes")
      .upsert({ user_id: session.user.id, resume_text: text, updated_at: new Date().toISOString() });
  }

  async function handleStatusChange(jobId: string, status: MatchStatus) {
    if (!session) return;

    const existing = matches.find((m) => m.job_id === jobId);
    // applied_at is set once, the first time a match leaves "new" — later
    // status changes (phone_screen, onsite, ...) don't reset the clock,
    // since the follow-up nudge should track "days since you applied," not
    // "days since the last status change."
    const appliedAt =
      existing?.applied_at ?? (APPLIED_STATUSES.includes(status) ? new Date().toISOString() : null);

    setMatches((prev) =>
      prev.map((m) => (m.job_id === jobId ? { ...m, status, applied_at: appliedAt } : m))
    );

    await supabase
      .from("matches")
      .update({ status, applied_at: appliedAt })
      .eq("job_id", jobId)
      .eq("user_id", session.user.id);

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
    setMatches((prev) => prev.map((m) => (m.job_id === jobId ? { ...m, notes } : m)));
    await supabase.from("matches").update({ notes }).eq("job_id", jobId).eq("user_id", session.user.id);

    const job = matches.find((m) => m.job_id === jobId);
    logActivity(session.user.id, "application", jobId, "note_added", {
      company: job?.jobs?.company,
      title: job?.jobs?.title,
    });
  }

  function handleSaveToggle(jobId: string, job: JobRow, saved: boolean) {
    if (saved) {
      setSavedJobs((prev) => [
        { id: Date.now(), job_id: jobId, created_at: new Date().toISOString(), jobs: job },
        ...prev,
      ]);
    } else {
      setSavedJobs((prev) => prev.filter((s) => s.job_id !== jobId));
    }
  }

  function handleUnsave(jobId: string) {
    setSavedJobs((prev) => prev.filter((s) => s.job_id !== jobId));
  }

  const defaultResumeVersion = useMemo(
    () => resumeVersions.find((v) => v.is_default),
    [resumeVersions]
  );
  const resumeText = defaultResumeVersion?.resume_text ?? "";

  async function handleAddResumeVersion(title: string, text: string) {
    if (!session) return;
    const makeDefault = resumeVersions.length === 0;
    const { data, error } = await supabase
      .from("resume_versions")
      .insert({ user_id: session.user.id, title, resume_text: text, is_default: makeDefault })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const inserted = data as ResumeVersion;
    setResumeVersions((prev) => [inserted, ...prev]);
    if (makeDefault) await syncLegacyResume(text);
    logActivity(session.user.id, "resume", String(inserted.id), "resume_version_added", { title });
  }

  async function handleSetDefaultResumeVersion(id: number) {
    if (!session) return;
    const target = resumeVersions.find((v) => v.id === id);
    if (!target || target.is_default) return;

    await supabase.from("resume_versions").update({ is_default: false }).eq("user_id", session.user.id).eq("is_default", true);
    await supabase.from("resume_versions").update({ is_default: true }).eq("id", id);

    setResumeVersions((prev) => prev.map((v) => ({ ...v, is_default: v.id === id })));
    await syncLegacyResume(target.resume_text);
    logActivity(session.user.id, "resume", String(id), "resume_version_set_default", { title: target.title });
  }

  async function handleUpdateResumeVersion(id: number, text: string) {
    if (!session) return;
    const target = resumeVersions.find((v) => v.id === id);
    await supabase.from("resume_versions").update({ resume_text: text }).eq("id", id);
    setResumeVersions((prev) => prev.map((v) => (v.id === id ? { ...v, resume_text: text } : v)));
    if (target?.is_default) await syncLegacyResume(text);
    logActivity(session.user.id, "resume", String(id), "resume_updated", {});
  }

  async function handleDeleteResumeVersion(id: number) {
    if (!session) return;
    const target = resumeVersions.find((v) => v.id === id);
    if (!target || target.is_default || resumeVersions.length <= 1) return;

    await supabase.from("resume_versions").delete().eq("id", id);
    setResumeVersions((prev) => prev.filter((v) => v.id !== id));
    logActivity(session.user.id, "resume", String(id), "resume_version_deleted", { title: target.title });
  }

  async function handleAnalyzeResumeVersion(id: number, atsScore: number, keywords: string[]) {
    if (!session) return;
    await supabase.from("resume_versions").update({ ats_score: atsScore, keywords }).eq("id", id);
    setResumeVersions((prev) => prev.map((v) => (v.id === id ? { ...v, ats_score: atsScore, keywords } : v)));
    const target = resumeVersions.find((v) => v.id === id);
    logActivity(session.user.id, "resume", String(id), "resume_analyzed", { title: target?.title, atsScore });
  }

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

  const savedJobIds = useMemo(() => new Set(savedJobs.map((s) => s.job_id)), [savedJobs]);

  const dismissedCount = useMemo(() => matches.filter((m) => m.status === "dismissed").length, [matches]);

  const followUpCount = useMemo(
    () =>
      matches.filter(
        (m) =>
          m.status === "applied" &&
          m.applied_at &&
          Math.floor((Date.now() - new Date(m.applied_at).getTime()) / 86400000) >= 7
      ).length,
    [matches]
  );

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

    return {
      count: active.length,
      avgFit: Math.round(avgFit * 100),
      topFit: Math.round(top.fit_score * 100),
      topTitle: top.jobs?.title ?? "",
      topCompany: top.jobs?.company ?? "",
      companyCount: companies.size,
    };
  }, [matches]);

  // "Applied or later" — the set response rate and active-interview counts
  // are drawn from. Mirrors APPLIED_STATUSES (excludes 'new'/'dismissed').
  const applicationStats = useMemo(() => {
    const applied = matches.filter((m) => APPLIED_STATUSES.includes(m.status));
    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeek = applied.filter((m) => m.applied_at && new Date(m.applied_at).getTime() >= weekAgo);
    const activeInterviews = matches.filter((m) => m.status === "phone_screen" || m.status === "onsite");
    const offers = matches.filter((m) => m.status === "offer");
    // Of everything applied, the share that moved past the initial "applied"
    // stage — the closest real signal to "did someone respond" without a
    // dedicated recruiter-reply concept yet.
    const progressed = applied.filter((m) => m.status !== "applied");
    const responseRate = applied.length > 0 ? Math.round((progressed.length / applied.length) * 100) : 0;

    return {
      thisWeek: thisWeek.length,
      activeInterviews: activeInterviews.length,
      offers: offers.length,
      responseRate,
      appliedCount: applied.length,
    };
  }, [matches]);

  // Single highest-fit match still sitting at "New" — the one nudge most
  // worth surfacing on a dashboard, computed from data already on the page.
  const recommendedFocus = useMemo(() => {
    const candidates = matches.filter((m) => m.status === "new");
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => b.fit_score - a.fit_score)[0];
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
      <AppHeader session={session} active="/" />

      {loadingData ? (
        <div className="stat-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="stat-tile skeleton-tile" key={i} />
          ))}
        </div>
      ) : (
        stats && (
          <div className="stat-grid">
            <StatTile
              label="Shortlist size"
              value={<AnimatedNumber value={stats.count} />}
              subtitle="active matches"
              icon={<ListIcon />}
            />
            <StatTile
              label="Avg. fit"
              value={<AnimatedNumber value={stats.avgFit} suffix="%" />}
              subtitle={`across ${stats.count} roles`}
              icon={<TargetIcon />}
            />
            <StatTile
              label="Top match"
              value={<AnimatedNumber value={stats.topFit} suffix="%" />}
              subtitle={`${stats.topTitle} · ${stats.topCompany}`}
              icon={<TrophyIcon />}
              accent
            />
            <StatTile
              label="Follow-ups due"
              value={<AnimatedNumber value={followUpCount} />}
              subtitle={followUpCount > 0 ? "applied 7+ days ago" : `${stats.companyCount} companies`}
              icon={<BellIcon />}
            />
          </div>
        )
      )}

      {!loadingData && stats && (
        <div className="stat-grid">
          <StatTile
            label="Applied this week"
            value={<AnimatedNumber value={applicationStats.thisWeek} />}
            subtitle="last 7 days"
            icon={<TrendingUpIcon />}
          />
          <StatTile
            label="Active interviews"
            value={<AnimatedNumber value={applicationStats.activeInterviews} />}
            subtitle="phone screen or onsite"
            icon={<CalendarIcon />}
          />
          <StatTile
            label="Offers"
            value={<AnimatedNumber value={applicationStats.offers} />}
            subtitle={`across ${applicationStats.appliedCount} applications`}
            icon={<CheckCircleIcon />}
          />
          <StatTile
            label="Response rate"
            value={<AnimatedNumber value={applicationStats.responseRate} suffix="%" />}
            subtitle="moved past 'applied'"
            icon={<ActivityIcon />}
          />
        </div>
      )}

      {!loadingData && recommendedFocus && (
        <div className="card">
          <div className="focus-banner">
            <div className="focus-banner-copy">
              <span className="focus-banner-icon">
                <SparkleIcon size={18} />
              </span>
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  Recommended focus: {recommendedFocus.jobs?.title} · {recommendedFocus.jobs?.company}
                </p>
                <p className="hint" style={{ margin: 0 }}>
                  Your highest-fit match ({Math.round(recommendedFocus.fit_score * 100)}%) still sitting at
                  &ldquo;New&rdquo; — worth applying to first.
                </p>
              </div>
            </div>
            {recommendedFocus.jobs?.apply_url && (
              <a className="apply-link" href={recommendedFocus.jobs.apply_url} target="_blank" rel="noreferrer">
                Apply →
              </a>
            )}
          </div>
        </div>
      )}

      {!loadingData && upcomingInterviews.length > 0 && (
        <div className="card">
          <div className="card-header-static">
            <h2 className="card-title-icon" style={{ margin: 0 }}>
              <CalendarIcon size={17} />
              Upcoming interviews
            </h2>
            <Link href="/interviews" className="icon-link">
              View all →
            </Link>
          </div>
          <ul className="activity-list" style={{ marginTop: "0.75rem" }}>
            {upcomingInterviews.map((iv) => (
              <li key={iv.id} className="activity-row">
                <span className="activity-text">
                  {iv.company} — {iv.role}
                </span>
                <span className="activity-time">
                  {new Date(iv.scheduled_at as string).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loadingData && matches.length > 0 && (
        <>
          <ApplicationsChart matches={matches} />
          <ActivityFeed userId={session.user.id} />
        </>
      )}

      {loadingData ? (
        <div className="card">
          <div className="skeleton-line" style={{ width: "40%" }} />
          <div className="skeleton-line" style={{ width: "70%", marginTop: "0.5rem" }} />
        </div>
      ) : (
        <ResumeCenter
          accessToken={session.access_token}
          versions={resumeVersions}
          onAdd={handleAddResumeVersion}
          onSetDefault={handleSetDefaultResumeVersion}
          onUpdate={handleUpdateResumeVersion}
          onDelete={handleDeleteResumeVersion}
          onAnalyzed={handleAnalyzeResumeVersion}
        />
      )}

      {!loadingData && (
        <ContactsManager userId={session.user.id} contacts={contacts} onContactsChange={setContacts} />
      )}

      <div className="card">
        <div className="shortlist-toolbar">
          <h2 style={{ margin: 0 }}>Your shortlist</h2>
          {matches.length > 0 && (
            <div className="toolbar-controls">
              <div className="preset-group">
                <button
                  type="button"
                  className={viewMode === "table" ? "primary" : "ghost"}
                  style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }}
                  onClick={() => setViewMode("table")}
                >
                  Table
                </button>
                <button
                  type="button"
                  className={viewMode === "board" ? "primary" : "ghost"}
                  style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }}
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
                  className="control-input search-input"
                />
              </div>
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
            onStatusChange={handleStatusChange}
            onNotesChange={handleNotesChange}
            onSaveTailoredResume={handleSaveTailoredResume}
          />
        )}
      </div>

      {!loadingData && <BrowseMatches resumeText={resumeText} accessToken={session.access_token} />}

      {!loadingData && (
        <>
          <JobSearch userId={session.user.id} savedJobIds={savedJobIds} onSaveToggle={handleSaveToggle} />
          <SavedJobs userId={session.user.id} savedJobs={savedJobs} onUnsave={handleUnsave} />
        </>
      )}
    </main>
  );
}

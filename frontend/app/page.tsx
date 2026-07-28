"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { APPLIED_STATUSES, Interview, MATCHES_SELECT, MatchedJobRow, MatchStatus } from "@/lib/types";
import { relativeTime } from "@/lib/activityDescribe";
import { logActivity } from "@/lib/logActivity";
import { SignIn } from "@/components/SignIn";
import { AppHeader } from "@/components/AppHeader";
import { AssistantPanel } from "@/components/AssistantPanel";
import { useAssistantOpen } from "@/lib/useAssistantOpen";
import { StatTile } from "@/components/StatTile";
import {
  ActivityIcon,
  BellIcon,
  CalendarIcon,
  CheckCircleIcon,
  ListIcon,
  Logomark,
  SparkleIcon,
  TargetIcon,
  TrendingUpIcon,
  TrophyIcon,
} from "@/components/icons";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ApplicationsChart } from "@/components/ApplicationsChart";
import { JobCard } from "@/components/JobCard";

// This page is inherently per-user (auth session, matches) — never static.
export const dynamic = "force-dynamic";

const TOP_MATCHES_COUNT = 5;

export default function Home() {
  const { session, loadingSession } = useSession();
  const [assistantOpen, setAssistantOpen] = useAssistantOpen();
  const [matches, setMatches] = useState<MatchedJobRow[]>([]);
  const [upcomingInterviews, setUpcomingInterviews] = useState<Interview[]>([]);
  // Starts true (not false) so the dashboard renders its loading skeleton
  // rather than an empty state before the fetch below resolves.
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setLoadingData(true);
    setLoadError(null);

    Promise.all([
      supabase.from("matches").select(MATCHES_SELECT).order("fit_score", { ascending: false }),
      supabase
        .from("interviews")
        .select("*")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(3),
    ]).then(([matchesRes, interviewsRes]) => {
      // A failed query here would otherwise render as "no matches yet" —
      // indistinguishable from a genuinely empty shortlist, which sends
      // the user chasing a non-problem.
      const err = matchesRes.error || interviewsRes.error;
      if (err) setLoadError("Couldn't load your dashboard data — try refreshing.");
      setMatches((matchesRes.data as unknown as MatchedJobRow[]) ?? []);
      setUpcomingInterviews((interviewsRes.data as Interview[]) ?? []);
      setLoadingData(false);
    });
  }, [session]);

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
      // Roll back — the write didn't actually happen, so the UI shouldn't
      // keep showing a status change that never made it to the database.
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

  const topMatches = useMemo(
    () =>
      matches
        .filter((m) => m.status !== "dismissed")
        .sort((a, b) => b.fit_score - a.fit_score)
        .slice(0, TOP_MATCHES_COUNT),
    [matches]
  );

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

  const content = (
    <>
      {loadError && <p className="error">{loadError}</p>}
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

      <div className="card">
        <div className="card-header-static">
          <h2 style={{ margin: 0 }}>Top job matches</h2>
          <Link href="/jobs" className="icon-link">
            Browse jobs →
          </Link>
        </div>
        {loadingData ? (
          <div className="skeleton-table" style={{ marginTop: "0.85rem" }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div className="skeleton-row" key={i} />
            ))}
          </div>
        ) : topMatches.length === 0 ? (
          <p className="empty-state">
            No matches yet — add a resume in the Resume tab and the next scheduled match run will
            populate this.
          </p>
        ) : (
          <div className="top-matches-row-wrap" style={{ marginTop: "0.85rem" }}>
            <div className="top-matches-row">
              {topMatches.map((m, i) => {
                const pct = Math.round(m.fit_score * 100);
                return (
                  <JobCard
                    key={m.job_id}
                    index={i}
                    matchPct={pct}
                    postedLabel={m.jobs?.posted_at ? relativeTime(m.jobs.posted_at) : "Date unknown"}
                    title={m.jobs?.title ?? ""}
                    company={m.jobs?.company ?? ""}
                    skills={m.missing_skills}
                    actions={
                      <>
                        <button type="button" className="ghost" onClick={() => handleStatusChange(m.job_id, "dismissed")}>
                          Pass
                        </button>
                        {m.jobs?.apply_url && (
                          <a className="primary" href={m.jobs.apply_url} target="_blank" rel="noreferrer">
                            Apply
                          </a>
                        )}
                      </>
                    }
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {!loadingData && matches.length > 0 && (
        <>
          <ApplicationsChart matches={matches} />
          <ActivityFeed userId={session.user.id} />
        </>
      )}
    </>
  );

  return (
    <main className={assistantOpen ? "container-wide" : "container"}>
      <AppHeader session={session} active="/" />

      {assistantOpen ? (
        <div className="assistant-layout">
          <AssistantPanel session={session} onClose={() => setAssistantOpen(false)} />
          <div className="assistant-layout-main">{content}</div>
        </div>
      ) : (
        <>
          <button type="button" className="ghost icon-btn assistant-reopen" onClick={() => setAssistantOpen(true)}>
            <SparkleIcon size={14} /> Assistant
          </button>
          {content}
        </>
      )}
    </main>
  );
}

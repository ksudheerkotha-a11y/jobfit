"use client";

import { MatchedJobRow, ResumeVersion } from "@/lib/types";
import { ActivityRow } from "@/lib/activityDescribe";
import {
  computeFitByOutcome,
  computeFunnel,
  computeMedianResponseDays,
  computeTopCompanies,
  computeWeeklyTrend,
} from "@/lib/analytics";
import { StatTile } from "@/components/StatTile";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { ActivityIcon, CalendarIcon, CheckCircleIcon, ListIcon, TargetIcon, TrendingUpIcon, TrophyIcon } from "@/components/icons";

const WEEKS = 12;

function FunnelSection({ matches, activity }: { matches: MatchedJobRow[]; activity: ActivityRow[] }) {
  const steps = computeFunnel(matches, activity);
  const max = Math.max(1, ...steps.map((s) => s.count));

  return (
    <div className="card">
      <h2 className="card-title-icon" style={{ marginBottom: "0.75rem" }}>
        <ListIcon size={17} />
        Pipeline funnel
      </h2>
      <p className="hint" style={{ marginTop: 0, marginBottom: "1rem" }}>
        How far your shortlist has reached — including stages passed through before a later rejection.
      </p>
      <div className="funnel-list">
        {steps.map((s) => (
          <div className="funnel-row" key={s.status}>
            <span className="funnel-label">{s.label}</span>
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${(s.count / max) * 100}%` }} />
            </div>
            <span className="funnel-count">{s.count}</span>
            <span className="funnel-conversion">
              {s.conversionFromPrev === null ? "" : `${s.conversionFromPrev}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyTrendSection({ matches }: { matches: MatchedJobRow[] }) {
  const buckets = computeWeeklyTrend(matches, WEEKS);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const barWidth = 100 / WEEKS;

  return (
    <div className="card">
      <div className="chart-header">
        <h2 className="card-title-icon" style={{ margin: 0 }}>
          <TrendingUpIcon size={17} />
          Applications, last {WEEKS} weeks
        </h2>
        <span className="hint" style={{ margin: 0 }}>
          {total} total
        </span>
      </div>
      {total === 0 ? (
        <p className="hint" style={{ margin: "0.75rem 0 0" }}>
          Nothing applied to yet in this window.
        </p>
      ) : (
        <svg viewBox="0 0 100 40" className="applications-chart" preserveAspectRatio="none">
          {buckets.map((b, i) => {
            const height = (b.count / max) * 32;
            return (
              <rect
                key={b.key}
                x={i * barWidth + barWidth * 0.15}
                y={36 - height}
                width={barWidth * 0.7}
                height={Math.max(height, b.count > 0 ? 1.5 : 0)}
                rx={1}
                className="chart-bar"
              >
                <title>
                  Week of {b.label}: {b.count} application{b.count === 1 ? "" : "s"}
                </title>
              </rect>
            );
          })}
          <line x1="0" y1="36" x2="100" y2="36" className="chart-baseline" />
        </svg>
      )}
    </div>
  );
}

function FitByOutcomeSection({ matches }: { matches: MatchedJobRow[] }) {
  const rows = computeFitByOutcome(matches);
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((r) => r.avgFit));

  return (
    <div className="card">
      <h2 className="card-title-icon" style={{ marginBottom: "0.75rem" }}>
        <TargetIcon size={17} />
        Fit score vs. outcome
      </h2>
      <p className="hint" style={{ marginTop: 0, marginBottom: "1rem" }}>
        Average fit score for matches grouped by what happened to them — a sanity check on whether the score
        tracks real outcomes.
      </p>
      <div className="funnel-list">
        {rows.map((r) => (
          <div className="funnel-row" key={r.label}>
            <span className="funnel-label">{r.label}</span>
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${(r.avgFit / max) * 100}%` }} />
            </div>
            <span className="funnel-count">{r.avgFit}%</span>
            <span className="funnel-conversion">{r.count} role{r.count === 1 ? "" : "s"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopCompaniesSection({ matches }: { matches: MatchedJobRow[] }) {
  const rows = computeTopCompanies(matches, 8);
  if (rows.length === 0) return null;

  return (
    <div className="card">
      <h2 className="card-title-icon" style={{ marginBottom: "0.75rem" }}>
        <TrophyIcon size={17} />
        Most-applied companies
      </h2>
      <div className="pill-row">
        {rows.map((r) => (
          <span className="pill" key={r.company}>
            {r.company} · {r.count}
          </span>
        ))}
      </div>
    </div>
  );
}

function ResumeSnapshotSection({ defaultVersion }: { defaultVersion: ResumeVersion | undefined }) {
  return (
    <div className="card">
      <h2 className="card-title-icon" style={{ marginBottom: "0.75rem" }}>
        <CheckCircleIcon size={17} />
        Default resume
      </h2>
      {!defaultVersion ? (
        <p className="hint" style={{ margin: 0 }}>
          No default resume set yet — add one in the Resume Center on your dashboard.
        </p>
      ) : defaultVersion.ats_score === null ? (
        <p className="hint" style={{ margin: 0 }}>
          &ldquo;{defaultVersion.title}&rdquo; hasn&apos;t been analyzed yet — run Analyze in the Resume Center to see
          an ATS score here.
        </p>
      ) : (
        <>
          <p style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>
            &ldquo;{defaultVersion.title}&rdquo; — ATS score {defaultVersion.ats_score}/100
          </p>
          <div className="pill-row">
            {defaultVersion.keywords.slice(0, 10).map((k) => (
              <span className="pill" key={k}>{k}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AnalyticsView({
  matches,
  activity,
  defaultResumeVersion,
}: {
  matches: MatchedJobRow[];
  activity: ActivityRow[];
  defaultResumeVersion: ResumeVersion | undefined;
}) {
  if (matches.length === 0) {
    return (
      <p className="empty-state">
        No matches yet — analytics will populate once your shortlist and application history have some data
        in them.
      </p>
    );
  }

  const applied = matches.filter((m) => m.applied_at).length;
  const interviewing = matches.filter((m) => m.status === "phone_screen" || m.status === "onsite" || m.status === "offer").length;
  const offers = matches.filter((m) => m.status === "offer").length;
  const medianResponseDays = computeMedianResponseDays(matches, activity);
  const interviewRate = applied > 0 ? Math.round((interviewing / applied) * 100) : 0;
  const offerRate = applied > 0 ? Math.round((offers / applied) * 100) : 0;

  return (
    <>
      <div className="stat-grid">
        <StatTile
          label="Applications"
          value={<AnimatedNumber value={applied} />}
          subtitle="total sent"
          icon={<ListIcon />}
        />
        <StatTile
          label="Median response time"
          value={medianResponseDays === null ? "—" : <AnimatedNumber value={medianResponseDays} suffix="d" />}
          subtitle={medianResponseDays === null ? "not enough data yet" : "applied → first status change"}
          icon={<CalendarIcon />}
        />
        <StatTile
          label="Interview rate"
          value={<AnimatedNumber value={interviewRate} suffix="%" />}
          subtitle={`${interviewing} of ${applied} applied`}
          icon={<ActivityIcon />}
          accent
        />
        <StatTile
          label="Offer rate"
          value={<AnimatedNumber value={offerRate} suffix="%" />}
          subtitle={`${offers} of ${applied} applied`}
          icon={<TrophyIcon />}
        />
      </div>

      <FunnelSection matches={matches} activity={activity} />
      <WeeklyTrendSection matches={matches} />
      <FitByOutcomeSection matches={matches} />
      <TopCompaniesSection matches={matches} />
      <ResumeSnapshotSection defaultVersion={defaultResumeVersion} />
    </>
  );
}

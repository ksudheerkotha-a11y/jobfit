import { MatchedJobRow, MatchStatus, STATUS_LABELS } from "@/lib/types";
import { ActivityRow } from "@/lib/activityDescribe";

// Only the linear pipeline stages count toward "how far did it get" — offer
// is the deepest real stage; rejected/dismissed are terminal outcomes, not
// funnel steps (an application rejected after an onsite still reached the
// onsite stage, which is recovered from activity_log history below).
const FUNNEL_STAGES: MatchStatus[] = ["new", "applied", "phone_screen", "onsite", "offer"];

export type FunnelStep = { status: MatchStatus; label: string; count: number; conversionFromPrev: number | null };

/** For each match, the deepest pipeline stage it's known to have reached —
 * either its current status, or (for matches later rejected/dismissed) the
 * highest 'to' stage ever recorded for it in activity_log. Falls back to
 * current status alone when there's no history yet. */
function deepestStageReached(matches: MatchedJobRow[], activity: ActivityRow[]): Map<string, number> {
  const indexOf = (s: string) => FUNNEL_STAGES.indexOf(s as MatchStatus);
  const deepest = new Map<string, number>();

  for (const m of matches) {
    deepest.set(m.job_id, Math.max(0, indexOf(m.status)));
  }

  for (const row of activity) {
    if (row.entity_type !== "application" || row.action !== "status_changed") continue;
    const to = String(row.metadata.to ?? "");
    const idx = indexOf(to);
    if (idx === -1) continue;
    const current = deepest.get(row.entity_id) ?? -1;
    if (idx > current) deepest.set(row.entity_id, idx);
  }

  return deepest;
}

export function computeFunnel(matches: MatchedJobRow[], activity: ActivityRow[]): FunnelStep[] {
  const deepest = deepestStageReached(matches, activity);
  const counts = FUNNEL_STAGES.map(
    (_, i) => Array.from(deepest.values()).filter((depth) => depth >= i).length
  );

  return FUNNEL_STAGES.map((status, i) => ({
    status,
    label: STATUS_LABELS[status],
    count: counts[i],
    conversionFromPrev: i === 0 || counts[i - 1] === 0 ? null : Math.round((counts[i] / counts[i - 1]) * 100),
  }));
}

export type WeekBucket = { key: string; label: string; count: number };

function mondayOf(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function computeWeeklyTrend(matches: MatchedJobRow[], weeks: number): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  const thisMonday = mondayOf(new Date());

  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - i * 7);
    buckets.push({
      key: start.toISOString().slice(0, 10),
      label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: 0,
    });
  }

  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const m of matches) {
    if (!m.applied_at) continue;
    const key = mondayOf(new Date(m.applied_at)).toISOString().slice(0, 10);
    const bucket = byKey.get(key);
    if (bucket) bucket.count += 1;
  }

  return buckets;
}

/** Median days between a match's applied_at and the next status_changed
 * event recorded after it — a real "how long until something happens"
 * metric, not a guess. Only counts matches that actually got a follow-up
 * status change (still-pending applications don't have one yet). */
export function computeMedianResponseDays(matches: MatchedJobRow[], activity: ActivityRow[]): number | null {
  const byJob = new Map<string, ActivityRow[]>();
  for (const row of activity) {
    if (row.entity_type !== "application" || row.action !== "status_changed") continue;
    const list = byJob.get(row.entity_id) ?? [];
    list.push(row);
    byJob.set(row.entity_id, list);
  }

  const days: number[] = [];
  for (const m of matches) {
    if (!m.applied_at) continue;
    const appliedTime = new Date(m.applied_at).getTime();
    const events = (byJob.get(m.job_id) ?? [])
      .map((r) => new Date(r.created_at).getTime())
      .filter((t) => t > appliedTime)
      .sort((a, b) => a - b);
    if (events.length > 0) {
      days.push((events[0] - appliedTime) / 86400000);
    }
  }

  if (days.length === 0) return null;
  days.sort((a, b) => a - b);
  const mid = Math.floor(days.length / 2);
  const median = days.length % 2 === 0 ? (days[mid - 1] + days[mid]) / 2 : days[mid];
  return Math.round(median);
}

export type CompanyBreakdown = { company: string; count: number };

export function computeTopCompanies(matches: MatchedJobRow[], limit: number): CompanyBreakdown[] {
  const counts = new Map<string, number>();
  for (const m of matches) {
    const company = m.jobs?.company;
    if (!company) continue;
    counts.set(company, (counts.get(company) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export type FitBreakdown = { label: string; avgFit: number; count: number };

/** Average fit score grouped by outcome — the honest way to show whether
 * the score actually tracks anything, using only statuses with enough
 * matches to not be noise. */
export function computeFitByOutcome(matches: MatchedJobRow[]): FitBreakdown[] {
  const groups: { label: string; statuses: MatchStatus[] }[] = [
    { label: "Not yet applied", statuses: ["new"] },
    { label: "Applied, no response yet", statuses: ["applied"] },
    { label: "Interviewing", statuses: ["phone_screen", "onsite"] },
    { label: "Offer", statuses: ["offer"] },
    { label: "Rejected", statuses: ["rejected"] },
  ];

  return groups
    .map(({ label, statuses }) => {
      const subset = matches.filter((m) => statuses.includes(m.status));
      if (subset.length === 0) return null;
      const avgFit = Math.round((subset.reduce((sum, m) => sum + m.fit_score, 0) / subset.length) * 100);
      return { label, avgFit, count: subset.length };
    })
    .filter((g): g is FitBreakdown => g !== null);
}

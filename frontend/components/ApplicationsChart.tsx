"use client";

import { TrendingUpIcon } from "@/components/icons";
import { MatchedJobRow } from "@/lib/types";

const DAYS = 14;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ApplicationsChart({ matches }: { matches: MatchedJobRow[] }) {
  const today = new Date();
  const buckets: { key: string; label: string; count: number }[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({
      key: dayKey(d),
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const m of matches) {
    if (!m.applied_at) continue;
    const key = dayKey(new Date(m.applied_at));
    const bucket = byKey.get(key);
    if (bucket) bucket.count += 1;
  }

  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((sum, b) => sum + b.count, 0);

  const barWidth = 100 / DAYS;

  return (
    <div className="card">
      <div className="chart-header">
        <h2 className="card-title-icon" style={{ margin: 0 }}>
          <TrendingUpIcon size={17} />
          Applications, last 14 days
        </h2>
        <span className="hint" style={{ margin: 0 }}>
          {total} total
        </span>
      </div>
      {total === 0 ? (
        <p className="hint" style={{ margin: "0.75rem 0 0" }}>
          Nothing applied to yet in this window — moving a match past &ldquo;New&rdquo; will show up here.
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
                rx={1.2}
                className="chart-bar"
              >
                <title>
                  {b.label}: {b.count} application{b.count === 1 ? "" : "s"}
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

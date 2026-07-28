"use client";

import { ReactNode } from "react";

export const CARD_TINTS = [
  "match-card-tint-0",
  "match-card-tint-1",
  "match-card-tint-2",
  "match-card-tint-3",
  "match-card-tint-4",
];

function avatarHue(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

function initial(s: string): string {
  return s.trim().charAt(0).toUpperCase() || "?";
}

/** Shared premium card used everywhere a job/match is shown as a grid tile
 * — Dashboard's Top matches row, Tracker's Cards view, and the Browse jobs
 * grids. One visual language (tinted background, match ring, company
 * avatar) instead of each page re-inventing its own job tile. */
export function JobCard({
  index,
  matchPct,
  postedLabel,
  title,
  company,
  location,
  skills,
  badges,
  actions,
  dimmed,
}: {
  index: number;
  matchPct?: number;
  postedLabel?: string;
  title: string;
  company: string;
  location?: string;
  skills?: string[];
  badges?: ReactNode;
  actions: ReactNode;
  dimmed?: boolean;
}) {
  const tint = CARD_TINTS[index % CARD_TINTS.length];
  return (
    <div className={`match-card ${tint}${dimmed ? " match-card-dimmed" : ""}`}>
      <div className="match-card-top">
        <span className="match-card-posted">{postedLabel ?? " "}</span>
        {matchPct !== undefined && (
          <span
            className="match-ring"
            style={{
              background: `conic-gradient(var(--text-primary) ${matchPct}%, color-mix(in srgb, var(--text-primary) 14%, transparent) 0)`,
            }}
          >
            <span className="match-ring-value">{matchPct}%</span>
            <span className="match-ring-label">Match</span>
          </span>
        )}
      </div>
      <p className="match-card-title">{title}</p>
      {badges}
      {skills && skills.length > 0 && (
        <div className="match-card-skills">
          {skills.map((skill) => (
            <span className="pill" key={skill}>
              {skill}
            </span>
          ))}
        </div>
      )}
      <div className="match-card-bottom">
        <div className="match-card-company">
          <span
            className="job-card-avatar"
            style={{ background: `hsl(${avatarHue(company)}, 46%, 40%)` }}
            aria-hidden="true"
          >
            {initial(company)}
          </span>
          <span>
            {company}
            {location ? ` · ${location}` : ""}
          </span>
        </div>
        <div className="match-card-actions">{actions}</div>
      </div>
    </div>
  );
}

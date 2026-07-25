"use client";

import { MatchedJobRow } from "@/lib/types";

const MAX_VISIBLE_SKILLS = 3;

export function MatchesTable({ matches }: { matches: MatchedJobRow[] }) {
  if (matches.length === 0) {
    return (
      <div className="empty-state">
        No matches yet. Once you save a resume, the next scheduled ingest + match run
        (every 6h via GitHub Actions) will populate your shortlist here.
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="matches-table">
        <thead>
          <tr>
            <th>Fit</th>
            <th>Role</th>
            <th>Location</th>
            <th>Missing skills</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m, i) => {
            const pct = Math.round(m.fit_score * 100);
            const visible = m.missing_skills.slice(0, MAX_VISIBLE_SKILLS);
            const overflow = m.missing_skills.length - visible.length;

            return (
              <tr key={i}>
                <td>
                  <div className="fit-cell">
                    <span className="fit-value">{pct}%</span>
                    <div className="meter-track">
                      <div className="meter-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </td>
                <td className="role-cell">
                  <div className="title">{m.jobs?.title}</div>
                  <div className="company">{m.jobs?.company}</div>
                </td>
                <td>{m.jobs?.location}</td>
                <td>
                  {visible.length === 0 ? (
                    <span className="hint" style={{ margin: 0 }}>
                      —
                    </span>
                  ) : (
                    <div className="pill-row">
                      {visible.map((skill) => (
                        <span className="pill" key={skill}>
                          {skill}
                        </span>
                      ))}
                      {overflow > 0 && <span className="pill">+{overflow}</span>}
                    </div>
                  )}
                </td>
                <td>
                  {m.jobs?.apply_url && (
                    <a
                      className="apply-link"
                      href={m.jobs.apply_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Apply →
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { MatchedJobRow } from "@/lib/types";

export function MatchesTable({ matches }: { matches: MatchedJobRow[] }) {
  if (matches.length === 0) {
    return (
      <p className="hint">
        No matches yet. Once you save a resume, the next scheduled ingest + match run
        (every 6h via GitHub Actions) will populate your shortlist here.
      </p>
    );
  }

  return (
    <table className="matches-table">
      <thead>
        <tr>
          <th>Fit</th>
          <th>Company</th>
          <th>Title</th>
          <th>Location</th>
          <th>Missing skills</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {matches.map((m, i) => (
          <tr key={i}>
            <td>{(m.fit_score * 100).toFixed(0)}%</td>
            <td>{m.jobs?.company}</td>
            <td>{m.jobs?.title}</td>
            <td>{m.jobs?.location}</td>
            <td>{m.missing_skills.join(", ") || "—"}</td>
            <td>
              {m.jobs?.apply_url && (
                <a href={m.jobs.apply_url} target="_blank" rel="noreferrer">
                  Apply
                </a>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

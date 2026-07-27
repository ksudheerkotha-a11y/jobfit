"use client";

import { useState } from "react";
import { CompassIcon } from "@/components/icons";

type BrowseRow = {
  job_id: string;
  score: number;
  title: string;
  company: string;
  location: string;
  apply_url: string;
  posted_at: string | null;
};

export function BrowseMatches({ resumeText, accessToken }: { resumeText: string; accessToken: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<BrowseRow[] | null>(null);
  const [scanned, setScanned] = useState(0);

  async function handleLoad() {
    setOpen(true);
    if (matches) return; // already loaded this session

    if (!resumeText.trim()) {
      setError("Save a resume above first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/browse-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ resumeText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setMatches(data.matches);
      setScanned(data.scanned);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header" onClick={() => (open ? setOpen(false) : handleLoad())}>
        <div>
          <h2 className="card-title-icon">
            <CompassIcon size={17} />
            More matches
          </h2>
          <p className="hint" style={{ marginBottom: 0 }}>
            {matches
              ? `${matches.length} keyword-scored matches from ${scanned} recent postings — broader net, lower confidence than your AI-verified shortlist`
              : "Browse a wider pool beyond the AI-verified shortlist — fast, free keyword matching, no daily limit"}
          </p>
        </div>
        <span className={`chevron ${open ? "open" : ""}`}>▾</span>
      </div>

      {open && (
        <div style={{ marginTop: "1rem" }}>
          {loading && <p className="hint" style={{ margin: 0 }}>Scanning recent postings...</p>}
          {error && <p className="error">{error}</p>}
          {matches && matches.length === 0 && (
            <p className="empty-state">
              No additional matches found — your AI-verified shortlist already covers the best of what's
              stored.
            </p>
          )}
          {matches && matches.length > 0 && (
            <div className="table-wrap">
              <table className="matches-table browse-table">
                <thead>
                  <tr>
                    <th>Match</th>
                    <th>Role</th>
                    <th>Location</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => (
                    <tr key={m.job_id}>
                      <td>
                        <span className="pill">{Math.round(m.score * 100)}%</span>
                      </td>
                      <td className="role-cell">
                        <div className="title">{m.title}</div>
                        <div className="company">{m.company}</div>
                      </td>
                      <td>{m.location}</td>
                      <td>
                        {m.apply_url && (
                          <a className="apply-link" href={m.apply_url} target="_blank" rel="noreferrer">
                            Apply →
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

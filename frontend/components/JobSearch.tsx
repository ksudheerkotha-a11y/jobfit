"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { SearchIcon } from "@/components/icons";
import { JobRow } from "@/lib/types";
import { logActivity } from "@/lib/logActivity";

const PAGE_SIZE = 20;

/** Deliberately not fit-scored — that's the shortlist / "More matches"
 * tiers. This is plain search over the full jobs table, for "does Company X
 * have anything open" style lookups the AI-scored views don't answer. */
export function JobSearch({
  userId,
  savedJobIds,
  onSaveToggle,
}: {
  userId: string;
  savedJobIds: Set<string>;
  onSaveToggle: (jobId: string, job: JobRow, saved: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<JobRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim() && !location.trim()) {
      setError("Enter a role, company, or location to search.");
      setResults(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let q = supabase.from("jobs").select("id, title, company, location, description, apply_url, posted_at");
      const term = query.trim();
      if (term) q = q.or(`title.ilike.%${term}%,company.ilike.%${term}%`);
      if (location.trim()) q = q.ilike("location", `%${location.trim()}%`);
      const { data, error } = await q.order("posted_at", { ascending: false }).limit(PAGE_SIZE);
      if (error) throw error;
      setResults((data as JobRow[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function toggleSave(job: JobRow) {
    const alreadySaved = savedJobIds.has(job.id);
    setSavingId(job.id);
    try {
      if (alreadySaved) {
        await supabase.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", job.id);
        logActivity(userId, "job", job.id, "job_unsaved", { title: job.title, company: job.company });
      } else {
        await supabase.from("saved_jobs").insert({ user_id: userId, job_id: job.id });
        logActivity(userId, "job", job.id, "job_saved", { title: job.title, company: job.company });
      }
      onSaveToggle(job.id, job, !alreadySaved);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen((v) => !v)}>
        <div>
          <h2 className="card-title-icon">
            <SearchIcon size={17} />
            Search all jobs
          </h2>
          <p className="hint" style={{ marginBottom: 0 }}>
            Look up any company or role in the ingested pool — not fit-scored, just search.
          </p>
        </div>
        <span className={`chevron ${open ? "open" : ""}`}>▾</span>
      </div>

      {open && (
        <div style={{ marginTop: "1rem" }}>
          <form onSubmit={handleSearch} className="toolbar-controls" style={{ marginBottom: "1rem" }}>
            <div className="search-input-wrap">
              <SearchIcon size={15} className="search-input-icon" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Role or company..."
                className="control-input search-input"
                style={{ width: 220 }}
              />
            </div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location..."
              className="control-input"
              style={{ width: 160 }}
            />
            <button type="submit" className="primary" disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
          </form>

          {error && <p className="error">{error}</p>}

          {results && results.length === 0 && !error && (
            <p className="empty-state">No jobs matched that search.</p>
          )}

          {results && results.length > 0 && (
            <div className="table-wrap">
              <table className="matches-table browse-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Location</th>
                    <th>Posted</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((job) => {
                    const saved = savedJobIds.has(job.id);
                    return (
                      <tr key={job.id}>
                        <td className="role-cell">
                          <div className="title">{job.title}</div>
                          <div className="company">{job.company}</div>
                        </td>
                        <td>{job.location}</td>
                        <td>{job.posted_at ?? "—"}</td>
                        <td>
                          <div className="row-actions-top">
                            <button
                              type="button"
                              className={saved ? "ghost" : "primary"}
                              style={{ padding: "0.25rem 0.7rem", fontSize: "0.75rem" }}
                              onClick={() => toggleSave(job)}
                              disabled={savingId === job.id}
                            >
                              {saved ? "Saved" : "Save"}
                            </button>
                            {job.apply_url && (
                              <a className="apply-link" href={job.apply_url} target="_blank" rel="noreferrer">
                                Apply →
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

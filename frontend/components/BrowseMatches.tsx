"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { CompassIcon } from "@/components/icons";
import { JobCard } from "@/components/JobCard";
import { JobRow } from "@/lib/types";
import { logActivity } from "@/lib/logActivity";

type BrowseRow = {
  job_id: string;
  score: number;
  title: string;
  company: string;
  location: string;
  apply_url: string;
  posted_at: string | null;
};

export function BrowseMatches({
  resumeText,
  accessToken,
  userId,
  savedJobIds,
  onSaveToggle,
}: {
  resumeText: string;
  accessToken: string;
  userId: string;
  savedJobIds: Set<string>;
  onSaveToggle: (jobId: string, job: JobRow, saved: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<BrowseRow[] | null>(null);
  const [scanned, setScanned] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);

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

  async function toggleSave(row: BrowseRow) {
    const alreadySaved = savedJobIds.has(row.job_id);
    setSavingId(row.job_id);
    setError(null);
    try {
      if (alreadySaved) {
        const { error } = await supabase.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", row.job_id);
        if (error) throw new Error(error.message);
        logActivity(userId, "job", row.job_id, "job_unsaved", { title: row.title, company: row.company });
      } else {
        const { error } = await supabase.from("saved_jobs").insert({ user_id: userId, job_id: row.job_id });
        if (error) throw new Error(error.message);
        logActivity(userId, "job", row.job_id, "job_saved", { title: row.title, company: row.company });
      }
      const job: JobRow = {
        id: row.job_id,
        title: row.title,
        company: row.company,
        location: row.location,
        description: "",
        apply_url: row.apply_url,
        posted_at: row.posted_at,
      };
      onSaveToggle(row.job_id, job, !alreadySaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that job");
    } finally {
      setSavingId(null);
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
              No additional matches found — your AI-verified shortlist already covers the best of what&apos;s
              stored.
            </p>
          )}
          {matches && matches.length > 0 && (
            <div className="job-grid">
              {matches.map((m, i) => {
                const saved = savedJobIds.has(m.job_id);
                return (
                  <JobCard
                    key={m.job_id}
                    index={i}
                    matchPct={Math.round(m.score * 100)}
                    postedLabel={m.posted_at ?? "Date unknown"}
                    title={m.title}
                    company={m.company}
                    location={m.location}
                    actions={
                      <>
                        <button
                          type="button"
                          className={saved ? "ghost" : "primary"}
                          onClick={() => toggleSave(m)}
                          disabled={savingId === m.job_id}
                        >
                          {saved ? "Saved" : "Save"}
                        </button>
                        {m.apply_url && (
                          <a className="ghost" href={m.apply_url} target="_blank" rel="noreferrer">
                            Apply
                          </a>
                        )}
                      </>
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { ListIcon } from "@/components/icons";
import { SavedJob } from "@/lib/types";
import { logActivity } from "@/lib/logActivity";
import { JobCard } from "@/components/JobCard";

const MAX_COMPARE = 3;

export function SavedJobs({
  userId,
  savedJobs,
  onUnsave,
}: {
  userId: string;
  savedJobs: SavedJob[];
  onUnsave: (jobId: string) => void;
}) {
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [unsaveError, setUnsaveError] = useState<string | null>(null);

  async function handleUnsave(jobId: string, title?: string, company?: string) {
    setUnsaveError(null);
    const { error } = await supabase.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", jobId);
    if (error) {
      setUnsaveError(error.message);
      return;
    }
    logActivity(userId, "job", jobId, "job_unsaved", { title, company });
    onUnsave(jobId);
    setCompareIds((prev) => {
      const next = new Set(prev);
      next.delete(jobId);
      return next;
    });
  }

  function toggleCompare(jobId: string) {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else if (next.size < MAX_COMPARE) {
        next.add(jobId);
      }
      return next;
    });
  }

  const compareRows = savedJobs.filter((s) => s.jobs && compareIds.has(s.job_id));

  return (
    <div className="card">
      <h2 className="card-title-icon" style={{ marginBottom: "0.25rem" }}>
        <ListIcon size={17} />
        Saved jobs
      </h2>
      <p className="hint" style={{ marginBottom: "0.75rem" }}>
        Bookmarks — separate from your AI-scored shortlist. Check up to {MAX_COMPARE} to compare.
      </p>

      {unsaveError && <p className="error">{unsaveError}</p>}

      {savedJobs.length === 0 ? (
        <p className="empty-state">
          Nothing saved yet — use Search all jobs above to find and bookmark roles.
        </p>
      ) : (
        <>
          <div className="job-grid">
            {savedJobs.map((s, i) => (
              <JobCard
                key={s.id}
                index={i}
                postedLabel={s.jobs?.posted_at ?? "Date unknown"}
                title={s.jobs?.title ?? "(listing removed)"}
                company={s.jobs?.company ?? ""}
                location={s.jobs?.location}
                actions={
                  <>
                    <label className="hint" style={{ display: "flex", alignItems: "center", gap: "0.3rem", margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={compareIds.has(s.job_id)}
                        onChange={() => toggleCompare(s.job_id)}
                        disabled={!compareIds.has(s.job_id) && compareIds.size >= MAX_COMPARE}
                        aria-label={`Compare ${s.jobs?.title ?? "job"}`}
                      />
                      Compare
                    </label>
                    <button type="button" className="ghost" onClick={() => handleUnsave(s.job_id, s.jobs?.title, s.jobs?.company)}>
                      Unsave
                    </button>
                    {s.jobs?.apply_url && (
                      <a className="primary" href={s.jobs.apply_url} target="_blank" rel="noreferrer">
                        Apply
                      </a>
                    )}
                  </>
                }
              />
            ))}
          </div>

          {compareRows.length >= 2 && (
            <div className="table-wrap" style={{ marginTop: "1.25rem" }}>
              <table className="matches-table browse-table compare-table">
                <thead>
                  <tr>
                    <th></th>
                    {compareRows.map((s) => (
                      <th key={s.job_id}>{s.jobs?.company}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="compare-label">Role</td>
                    {compareRows.map((s) => (
                      <td key={s.job_id}>{s.jobs?.title}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="compare-label">Location</td>
                    {compareRows.map((s) => (
                      <td key={s.job_id}>{s.jobs?.location}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="compare-label">Posted</td>
                    {compareRows.map((s) => (
                      <td key={s.job_id}>{s.jobs?.posted_at ?? "—"}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="compare-label">Description length</td>
                    {compareRows.map((s) => (
                      <td key={s.job_id}>{(s.jobs?.description.length ?? 0).toLocaleString()} chars</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

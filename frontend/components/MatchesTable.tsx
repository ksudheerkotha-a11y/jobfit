"use client";

import { Fragment, useState } from "react";
import { MatchedJobRow } from "@/lib/types";

const MAX_VISIBLE_SKILLS = 3;

type DraftState = {
  loading: boolean;
  text: string;
  error: string | null;
};

export function MatchesTable({
  matches,
  resumeText,
  accessToken,
}: {
  matches: MatchedJobRow[];
  resumeText: string;
  accessToken: string;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, DraftState>>({});

  async function handleDraft(i: number, m: MatchedJobRow) {
    setOpenIdx(i);

    if (!resumeText.trim()) {
      setDrafts((d) => ({ ...d, [i]: { loading: false, text: "", error: "Save a resume above first." } }));
      return;
    }

    setDrafts((d) => ({ ...d, [i]: { loading: true, text: d[i]?.text ?? "", error: null } }));

    try {
      const res = await fetch("/api/draft-cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          resumeText,
          jobTitle: m.jobs?.title,
          company: m.jobs?.company,
          jobDescription: m.jobs?.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate draft");
      setDrafts((d) => ({ ...d, [i]: { loading: false, text: data.draft, error: null } }));
    } catch (err) {
      setDrafts((d) => ({
        ...d,
        [i]: { loading: false, text: "", error: err instanceof Error ? err.message : "Something went wrong" },
      }));
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
  }

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
            const draft = drafts[i];
            const isOpen = openIdx === i;

            return (
              <Fragment key={i}>
                <tr>
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
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.35rem" }}>
                      <button
                        type="button"
                        className="ghost"
                        style={{ padding: "0.2rem 0.6rem", fontSize: "0.75rem" }}
                        onClick={() => (isOpen ? setOpenIdx(null) : handleDraft(i, m))}
                      >
                        {isOpen ? "Hide draft" : "Draft cover letter"}
                      </button>
                      {m.jobs?.apply_url && (
                        <a className="apply-link" href={m.jobs.apply_url} target="_blank" rel="noreferrer">
                          Apply →
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={5}>
                      {draft?.loading && <p className="hint" style={{ margin: 0 }}>Drafting...</p>}
                      {draft?.error && <p className="error">{draft.error}</p>}
                      {draft && !draft.loading && !draft.error && (
                        <div>
                          <textarea
                            rows={8}
                            value={draft.text}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [i]: { ...d[i], text: e.target.value } }))
                            }
                            style={{ marginBottom: "0.5rem" }}
                          />
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button type="button" onClick={() => handleCopy(draft.text)}>
                              Copy
                            </button>
                            <button type="button" className="ghost" onClick={() => handleDraft(i, m)}>
                              Regenerate
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

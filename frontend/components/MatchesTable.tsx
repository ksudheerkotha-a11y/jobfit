"use client";

import { Fragment, useState } from "react";
import { Contact, MatchedJobRow, MatchStatus, STATUS_LABELS } from "@/lib/types";

const MAX_VISIBLE_SKILLS = 3;
const FOLLOW_UP_DAYS = 7;
const STATUS_OPTIONS: MatchStatus[] = [
  "new",
  "applied",
  "phone_screen",
  "onsite",
  "offer",
  "rejected",
  "dismissed",
];

type PanelType = "cover-letter" | "tailor-resume" | "notes" | "referral";
type PanelState = { loading: boolean; text: string; error: string | null };

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeCompany(s: string): string {
  return s.trim().toLowerCase();
}

export function MatchesTable({
  matches,
  resumeText,
  accessToken,
  contacts,
  onStatusChange,
  onNotesChange,
}: {
  matches: MatchedJobRow[];
  resumeText: string;
  accessToken: string;
  contacts: Contact[];
  onStatusChange: (jobId: string, status: MatchStatus) => void;
  onNotesChange: (jobId: string, notes: string) => void;
}) {
  const [openPanel, setOpenPanel] = useState<{ idx: number; type: PanelType } | null>(null);
  const [panels, setPanels] = useState<Record<string, PanelState>>({});
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});

  function panelKey(idx: number, type: PanelType) {
    return `${idx}:${type}`;
  }

  function findContact(company: string): Contact | undefined {
    const needle = normalizeCompany(company);
    return contacts.find(
      (c) => normalizeCompany(c.company).includes(needle) || needle.includes(normalizeCompany(c.company))
    );
  }

  function togglePanel(idx: number, type: PanelType) {
    setOpenPanel((prev) => (prev?.idx === idx && prev.type === type ? null : { idx, type }));
  }

  async function runGroqPanel(idx: number, type: PanelType, endpoint: string, body: object, extract: (data: any) => string) {
    const key = panelKey(idx, type);
    setPanels((p) => ({ ...p, [key]: { loading: true, text: p[key]?.text ?? "", error: null } }));
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setPanels((p) => ({ ...p, [key]: { loading: false, text: extract(data), error: null } }));
    } catch (err) {
      setPanels((p) => ({
        ...p,
        [key]: { loading: false, text: "", error: err instanceof Error ? err.message : "Something went wrong" },
      }));
    }
  }

  function handleDraft(idx: number, m: MatchedJobRow) {
    togglePanel(idx, "cover-letter");
    if (!resumeText.trim()) {
      setPanels((p) => ({ ...p, [panelKey(idx, "cover-letter")]: { loading: false, text: "", error: "Save a resume above first." } }));
      return;
    }
    runGroqPanel(
      idx,
      "cover-letter",
      "/api/draft-cover-letter",
      { resumeText, jobTitle: m.jobs?.title, company: m.jobs?.company, jobDescription: m.jobs?.description },
      (data) => data.draft
    );
  }

  function handleTailor(idx: number, m: MatchedJobRow) {
    togglePanel(idx, "tailor-resume");
    if (!resumeText.trim()) {
      setPanels((p) => ({ ...p, [panelKey(idx, "tailor-resume")]: { loading: false, text: "", error: "Save a resume above first." } }));
      return;
    }
    runGroqPanel(
      idx,
      "tailor-resume",
      "/api/tailor-resume",
      { resumeText, jobTitle: m.jobs?.title, company: m.jobs?.company, jobDescription: m.jobs?.description },
      (data) => data.tailored
    );
  }

  function handleReferral(idx: number, m: MatchedJobRow, contact: Contact) {
    togglePanel(idx, "referral");
    if (!resumeText.trim()) {
      setPanels((p) => ({ ...p, [panelKey(idx, "referral")]: { loading: false, text: "", error: "Save a resume above first." } }));
      return;
    }
    runGroqPanel(
      idx,
      "referral",
      "/api/referral-draft",
      {
        resumeText,
        jobTitle: m.jobs?.title,
        company: m.jobs?.company,
        jobDescription: m.jobs?.description,
        contactName: contact.name,
        contactContext: contact.context,
      },
      (data) => data.draft
    );
  }

  function handleNotesOpen(idx: number, m: MatchedJobRow) {
    togglePanel(idx, "notes");
    setNotesDraft((d) => (idx in d ? d : { ...d, [idx]: m.notes ?? "" }));
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
  }

  if (matches.length === 0) {
    return (
      <div className="empty-state">
        <p style={{ margin: 0, fontWeight: 600 }}>No matches yet</p>
        <p className="hint" style={{ margin: "0.35rem 0 0" }}>
          Save a resume above — the next scheduled ingest + match run (every 12h via GitHub
          Actions) will populate your shortlist here.
        </p>
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
            <th>Stage</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m, i) => {
            const pct = Math.round(m.fit_score * 100);
            const visible = m.missing_skills.slice(0, MAX_VISIBLE_SKILLS);
            const overflow = m.missing_skills.length - visible.length;
            const dismissed = m.status === "dismissed";
            const contact = m.jobs ? findContact(m.jobs.company) : undefined;
            const needsFollowUp =
              m.status === "applied" && m.applied_at && daysSince(m.applied_at) >= FOLLOW_UP_DAYS;

            const isPanelOpen = (type: PanelType) => openPanel?.idx === i && openPanel.type === type;
            const activePanel = openPanel?.idx === i ? panels[panelKey(i, openPanel.type)] : undefined;

            return (
              <Fragment key={m.job_id}>
                <tr className={dismissed ? "row-dismissed" : undefined}>
                  <td>
                    <div className="fit-cell">
                      <span className="fit-value">{pct}%</span>
                      <div className="meter-track">
                        <div className="meter-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="role-cell">
                    <div className="title">
                      {m.jobs?.title}
                      {needsFollowUp && <span className="badge badge-warning">Follow up</span>}
                      {contact && <span className="badge badge-accent">Knows {contact.name}</span>}
                    </div>
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
                    <select
                      value={m.status}
                      onChange={(e) => onStatusChange(m.job_id, e.target.value as MatchStatus)}
                      className="control-input status-select"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="row-actions">
                      <div className="row-actions-top">
                        <button type="button" className="ghost" onClick={() => handleDraft(i, m)}>
                          {isPanelOpen("cover-letter") ? "Hide letter" : "Cover letter"}
                        </button>
                        <button type="button" className="ghost" onClick={() => handleTailor(i, m)}>
                          {isPanelOpen("tailor-resume") ? "Hide tailor" : "Tailor resume"}
                        </button>
                      </div>
                      <div className="row-actions-top">
                        <button type="button" className="ghost" onClick={() => handleNotesOpen(i, m)}>
                          {isPanelOpen("notes") ? "Hide notes" : m.notes ? "Notes ●" : "Notes"}
                        </button>
                        {contact && (
                          <button type="button" className="ghost" onClick={() => handleReferral(i, m, contact)}>
                            {isPanelOpen("referral") ? "Hide ask" : "Referral ask"}
                          </button>
                        )}
                      </div>
                      {m.jobs?.apply_url && (
                        <a className="apply-link" href={m.jobs.apply_url} target="_blank" rel="noreferrer">
                          Apply →
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
                {openPanel?.idx === i && (
                  <tr>
                    <td colSpan={6}>
                      {openPanel.type === "notes" ? (
                        <div>
                          <textarea
                            rows={4}
                            value={notesDraft[i] ?? ""}
                            onChange={(e) => setNotesDraft((d) => ({ ...d, [i]: e.target.value }))}
                            placeholder="Interviewer names, comp discussed, questions asked, anything worth remembering..."
                            style={{ marginBottom: "0.5rem" }}
                          />
                          <button type="button" onClick={() => onNotesChange(m.job_id, notesDraft[i] ?? "")}>
                            Save notes
                          </button>
                        </div>
                      ) : (
                        <>
                          {activePanel?.loading && (
                            <p className="hint" style={{ margin: 0 }}>
                              {openPanel.type === "tailor-resume" ? "Tailoring..." : "Drafting..."}
                            </p>
                          )}
                          {activePanel?.error && <p className="error">{activePanel.error}</p>}
                          {activePanel && !activePanel.loading && !activePanel.error && (
                            <div>
                              <textarea
                                rows={openPanel.type === "tailor-resume" ? 10 : 8}
                                value={activePanel.text}
                                onChange={(e) =>
                                  setPanels((p) => ({
                                    ...p,
                                    [panelKey(i, openPanel.type)]: { ...p[panelKey(i, openPanel.type)], text: e.target.value },
                                  }))
                                }
                                style={{ marginBottom: "0.5rem" }}
                              />
                              <div style={{ display: "flex", gap: "0.5rem" }}>
                                <button type="button" onClick={() => handleCopy(activePanel.text)}>
                                  Copy
                                </button>
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() => {
                                    if (openPanel.type === "cover-letter") handleDraft(i, m);
                                    else if (openPanel.type === "tailor-resume") handleTailor(i, m);
                                    else if (openPanel.type === "referral" && contact) handleReferral(i, m, contact);
                                  }}
                                >
                                  Regenerate
                                </button>
                              </div>
                            </div>
                          )}
                        </>
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

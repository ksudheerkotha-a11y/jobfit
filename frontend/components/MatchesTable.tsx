"use client";

import { Fragment, useState } from "react";
import { Contact, MatchedJobRow, MatchStatus, STATUS_LABELS, STATUS_OPTIONS } from "@/lib/types";
import { ActivityIcon, BellIcon, MailIcon, NoteIcon, SparkleIcon, UsersIcon } from "@/components/icons";
import { logActivity } from "@/lib/logActivity";
import { ApplicationTimeline } from "@/components/ApplicationTimeline";

const MAX_VISIBLE_SKILLS = 3;
const FOLLOW_UP_DAYS = 7;

type PanelType = "cover-letter" | "tailor-resume" | "notes" | "referral" | "timeline" | "followup";
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
  userId,
  contacts,
  onStatusChange,
  onNotesChange,
  onSaveTailoredResume,
}: {
  matches: MatchedJobRow[];
  resumeText: string;
  accessToken: string;
  userId: string;
  contacts: Contact[];
  onStatusChange: (jobId: string, status: MatchStatus) => void;
  onNotesChange: (jobId: string, notes: string) => void;
  onSaveTailoredResume: (text: string, jobTitle: string, company: string) => Promise<void>;
}) {
  // Everything below is keyed by job_id, not array index — visibleMatches
  // (the `matches` prop) gets re-sorted/re-filtered on every search/sort
  // change, so an index-keyed panel would silently show/save the wrong
  // job's notes or AI draft after the list reorders.
  const [openPanel, setOpenPanel] = useState<{ jobId: string; type: PanelType } | null>(null);
  const [panels, setPanels] = useState<Record<string, PanelState>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [savedTailorJobId, setSavedTailorJobId] = useState<string | null>(null);

  function panelKey(jobId: string, type: PanelType) {
    return `${jobId}:${type}`;
  }

  function findContact(company: string): Contact | undefined {
    const needle = normalizeCompany(company);
    return contacts.find(
      (c) => normalizeCompany(c.company).includes(needle) || needle.includes(normalizeCompany(c.company))
    );
  }

  function togglePanel(jobId: string, type: PanelType) {
    setOpenPanel((prev) => (prev?.jobId === jobId && prev.type === type ? null : { jobId, type }));
  }

  async function runGroqPanel(
    jobId: string,
    type: PanelType,
    endpoint: string,
    body: object,
    extract: (data: any) => string,
    activity: { jobId: string; action: string; metadata: Record<string, unknown> }
  ) {
    const key = panelKey(jobId, type);
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
      logActivity(userId, "application", activity.jobId, activity.action, activity.metadata);
    } catch (err) {
      setPanels((p) => ({
        ...p,
        [key]: { loading: false, text: "", error: err instanceof Error ? err.message : "Something went wrong" },
      }));
    }
  }

  function handleDraft(m: MatchedJobRow) {
    togglePanel(m.job_id, "cover-letter");
    if (!resumeText.trim()) {
      setPanels((p) => ({ ...p, [panelKey(m.job_id, "cover-letter")]: { loading: false, text: "", error: "Save a resume above first." } }));
      return;
    }
    runGroqPanel(
      m.job_id,
      "cover-letter",
      "/api/draft-cover-letter",
      { resumeText, jobTitle: m.jobs?.title, company: m.jobs?.company, jobDescription: m.jobs?.description },
      (data) => data.draft,
      { jobId: m.job_id, action: "cover_letter_generated", metadata: { company: m.jobs?.company, title: m.jobs?.title } }
    );
  }

  function handleTailor(m: MatchedJobRow) {
    togglePanel(m.job_id, "tailor-resume");
    if (!resumeText.trim()) {
      setPanels((p) => ({ ...p, [panelKey(m.job_id, "tailor-resume")]: { loading: false, text: "", error: "Save a resume above first." } }));
      return;
    }
    runGroqPanel(
      m.job_id,
      "tailor-resume",
      "/api/tailor-resume",
      { resumeText, jobTitle: m.jobs?.title, company: m.jobs?.company, jobDescription: m.jobs?.description },
      (data) => data.tailored,
      { jobId: m.job_id, action: "resume_tailored", metadata: { company: m.jobs?.company, title: m.jobs?.title } }
    );
  }

  function handleReferral(m: MatchedJobRow, contact: Contact) {
    togglePanel(m.job_id, "referral");
    if (!resumeText.trim()) {
      setPanels((p) => ({ ...p, [panelKey(m.job_id, "referral")]: { loading: false, text: "", error: "Save a resume above first." } }));
      return;
    }
    runGroqPanel(
      m.job_id,
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
      (data) => data.draft,
      { jobId: m.job_id, action: "referral_drafted", metadata: { company: m.jobs?.company, contact: contact.name } }
    );
  }

  function handleFollowup(m: MatchedJobRow) {
    togglePanel(m.job_id, "followup");
    if (!resumeText.trim()) {
      setPanels((p) => ({ ...p, [panelKey(m.job_id, "followup")]: { loading: false, text: "", error: "Save a resume above first." } }));
      return;
    }
    runGroqPanel(
      m.job_id,
      "followup",
      "/api/draft-followup",
      {
        resumeText,
        jobTitle: m.jobs?.title,
        company: m.jobs?.company,
        jobDescription: m.jobs?.description,
        daysSinceApplied: m.applied_at ? daysSince(m.applied_at) : undefined,
      },
      (data) => data.draft,
      { jobId: m.job_id, action: "followup_drafted", metadata: { company: m.jobs?.company, title: m.jobs?.title } }
    );
  }

  function handleNotesOpen(m: MatchedJobRow) {
    togglePanel(m.job_id, "notes");
    setNotesDraft((d) => (m.job_id in d ? d : { ...d, [m.job_id]: m.notes ?? "" }));
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
        <colgroup>
          <col style={{ width: "90px" }} />
          <col style={{ width: "220px" }} />
          <col style={{ width: "120px" }} />
          <col style={{ width: "210px" }} />
          <col style={{ width: "140px" }} />
          <col style={{ width: "230px" }} />
        </colgroup>
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
          {matches.map((m) => {
            const pct = Math.round(m.fit_score * 100);
            const visible = m.missing_skills.slice(0, MAX_VISIBLE_SKILLS);
            const overflow = m.missing_skills.length - visible.length;
            const dismissed = m.status === "dismissed";
            const contact = m.jobs ? findContact(m.jobs.company) : undefined;
            const needsFollowUp =
              m.status === "applied" && m.applied_at && daysSince(m.applied_at) >= FOLLOW_UP_DAYS;

            const isPanelOpen = (type: PanelType) => openPanel?.jobId === m.job_id && openPanel.type === type;
            const activePanel = openPanel?.jobId === m.job_id ? panels[panelKey(m.job_id, openPanel.type)] : undefined;

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
                        <button type="button" className="ghost icon-btn row-action-btn" onClick={() => handleDraft(m)}>
                          <MailIcon size={14} />
                          {isPanelOpen("cover-letter") ? "Hide letter" : "Cover letter"}
                        </button>
                        <button type="button" className="ghost icon-btn row-action-btn" onClick={() => handleTailor(m)}>
                          <SparkleIcon size={14} />
                          {isPanelOpen("tailor-resume") ? "Hide tailor" : "Tailor resume"}
                        </button>
                      </div>
                      <div className="row-actions-top">
                        <button type="button" className="ghost icon-btn row-action-btn" onClick={() => handleNotesOpen(m)}>
                          <NoteIcon size={14} />
                          {isPanelOpen("notes") ? "Hide notes" : m.notes ? "Notes ●" : "Notes"}
                        </button>
                        {contact && (
                          <button type="button" className="ghost icon-btn row-action-btn" onClick={() => handleReferral(m, contact)}>
                            <UsersIcon size={14} />
                            {isPanelOpen("referral") ? "Hide ask" : "Referral ask"}
                          </button>
                        )}
                        {needsFollowUp && (
                          <button type="button" className="ghost icon-btn row-action-btn" onClick={() => handleFollowup(m)}>
                            <BellIcon size={14} />
                            {isPanelOpen("followup") ? "Hide follow-up" : "Draft follow-up"}
                          </button>
                        )}
                        <button type="button" className="ghost icon-btn row-action-btn" onClick={() => togglePanel(m.job_id, "timeline")}>
                          <ActivityIcon size={14} />
                          {isPanelOpen("timeline") ? "Hide timeline" : "Timeline"}
                        </button>
                      </div>
                      {m.jobs?.apply_url && (
                        <a className="apply-link" href={m.jobs.apply_url} target="_blank" rel="noreferrer">
                          Apply →
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
                {openPanel?.jobId === m.job_id && (
                  <tr>
                    <td colSpan={6}>
                      {openPanel.type === "timeline" ? (
                        <ApplicationTimeline userId={userId} jobId={m.job_id} />
                      ) : openPanel.type === "notes" ? (
                        <div>
                          <textarea
                            rows={4}
                            value={notesDraft[m.job_id] ?? ""}
                            onChange={(e) => setNotesDraft((d) => ({ ...d, [m.job_id]: e.target.value }))}
                            placeholder="Interviewer names, comp discussed, questions asked, anything worth remembering..."
                            style={{ marginBottom: "0.5rem" }}
                          />
                          <button type="button" onClick={() => onNotesChange(m.job_id, notesDraft[m.job_id] ?? "")}>
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
                                    [panelKey(m.job_id, openPanel.type)]: { ...p[panelKey(m.job_id, openPanel.type)], text: e.target.value },
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
                                    if (openPanel.type === "cover-letter") handleDraft(m);
                                    else if (openPanel.type === "tailor-resume") handleTailor(m);
                                    else if (openPanel.type === "referral" && contact) handleReferral(m, contact);
                                    else if (openPanel.type === "followup") handleFollowup(m);
                                  }}
                                >
                                  Regenerate
                                </button>
                                {openPanel.type === "tailor-resume" && (
                                  <button
                                    type="button"
                                    className="ghost"
                                    onClick={async () => {
                                      try {
                                        await onSaveTailoredResume(activePanel.text, m.jobs?.title ?? "role", m.jobs?.company ?? "company");
                                        setSavedTailorJobId(m.job_id);
                                      } catch (err) {
                                        setPanels((p) => ({
                                          ...p,
                                          [panelKey(m.job_id, "tailor-resume")]: {
                                            ...p[panelKey(m.job_id, "tailor-resume")],
                                            error: err instanceof Error ? err.message : "Couldn't save that version",
                                          },
                                        }));
                                      }
                                    }}
                                  >
                                    {savedTailorJobId === m.job_id ? "Saved to Resume Center ✓" : "Save as resume version"}
                                  </button>
                                )}
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

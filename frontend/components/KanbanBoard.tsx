"use client";

import { useState } from "react";
import { Contact, MatchedJobRow, MatchStatus, STATUS_LABELS, STATUS_OPTIONS } from "@/lib/types";
import { ActivityIcon } from "@/components/icons";
import { ApplicationTimeline } from "@/components/ApplicationTimeline";

function normalizeCompany(s: string): string {
  return s.trim().toLowerCase();
}

/** Alternate view of the same `matches` data as MatchesTable — a status-
 * focused board rather than a detail-focused table. Cover letter / tailor /
 * referral actions stay in the table view; switch there for those. Drag
 * support is native HTML5 DnD (no new dependency); every card also has a
 * plain <select> so moving a card never requires a mouse. */
export function KanbanBoard({
  matches,
  userId,
  contacts,
  onStatusChange,
}: {
  matches: MatchedJobRow[];
  userId: string;
  contacts: Contact[];
  onStatusChange: (jobId: string, status: MatchStatus) => void;
}) {
  const [dragOverStatus, setDragOverStatus] = useState<MatchStatus | null>(null);
  const [openTimelineId, setOpenTimelineId] = useState<string | null>(null);

  function findContact(company: string): Contact | undefined {
    const needle = normalizeCompany(company);
    return contacts.find(
      (c) => normalizeCompany(c.company).includes(needle) || needle.includes(normalizeCompany(c.company))
    );
  }

  function handleDrop(e: React.DragEvent, status: MatchStatus) {
    e.preventDefault();
    setDragOverStatus(null);
    const jobId = e.dataTransfer.getData("text/job-id");
    if (jobId) onStatusChange(jobId, status);
  }

  if (matches.length === 0) {
    return (
      <div className="empty-state">
        <p style={{ margin: 0, fontWeight: 600 }}>No matches yet</p>
        <p className="hint" style={{ margin: "0.35rem 0 0" }}>
          Save a resume above — the next scheduled ingest + match run will populate your board here.
        </p>
      </div>
    );
  }

  return (
    <div className="kanban-board">
      {STATUS_OPTIONS.map((status) => {
        const cards = matches.filter((m) => m.status === status);
        return (
          <div
            key={status}
            className={`kanban-column${dragOverStatus === status ? " kanban-column-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStatus(status);
            }}
            onDragLeave={() => setDragOverStatus((s) => (s === status ? null : s))}
            onDrop={(e) => handleDrop(e, status)}
          >
            <div className="kanban-column-header">
              <span>{STATUS_LABELS[status]}</span>
              <span className="kanban-count">{cards.length}</span>
            </div>
            <div className="kanban-column-body">
              {cards.map((m) => {
                const pct = Math.round(m.fit_score * 100);
                const contact = m.jobs ? findContact(m.jobs.company) : undefined;
                const timelineOpen = openTimelineId === m.job_id;
                return (
                  <div
                    key={m.job_id}
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/job-id", m.job_id)}
                  >
                    <div className="kanban-card-top">
                      <span className="fit-value">{pct}%</span>
                      {contact && <span className="badge badge-accent">Knows {contact.name}</span>}
                    </div>
                    <div className="title" style={{ marginBottom: "0.15rem" }}>
                      {m.jobs?.title}
                    </div>
                    <div className="company">
                      {m.jobs?.company} · {m.jobs?.location}
                    </div>
                    {m.missing_skills.length > 0 && (
                      <div className="pill-row" style={{ marginTop: "0.5rem" }}>
                        {m.missing_skills.slice(0, 2).map((s) => (
                          <span className="pill" key={s}>
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="kanban-card-actions">
                      <select
                        value={m.status}
                        onChange={(e) => onStatusChange(m.job_id, e.target.value as MatchStatus)}
                        className="control-input status-select"
                        style={{ width: "auto", flex: 1 }}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="ghost icon-btn"
                        style={{ padding: "0.25rem 0.5rem" }}
                        onClick={() => setOpenTimelineId(timelineOpen ? null : m.job_id)}
                        aria-label="Toggle timeline"
                      >
                        <ActivityIcon size={14} />
                      </button>
                    </div>
                    {timelineOpen && (
                      <div style={{ marginTop: "0.5rem" }}>
                        <ApplicationTimeline userId={userId} jobId={m.job_id} />
                      </div>
                    )}
                  </div>
                );
              })}
              {cards.length === 0 && <p className="kanban-empty">Nothing here</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

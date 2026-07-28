"use client";

import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { APPLIED_STATUSES, INTERVIEW_STAGE_LABELS, INTERVIEW_STAGE_OPTIONS, Interview, InterviewStage, MatchedJobRow } from "@/lib/types";
import { logActivity } from "@/lib/logActivity";
import { CalendarIcon, SparkleIcon } from "@/components/icons";

export type InterviewInput = {
  job_id: string | null;
  company: string;
  role: string;
  stage: string;
  scheduled_at: string | null;
  meeting_link: string | null;
  notes: string;
};

const EMPTY_FORM: InterviewInput = {
  job_id: null,
  company: "",
  role: "",
  stage: "phone_screen",
  scheduled_at: null,
  meeting_link: null,
  notes: "",
};

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time, not
// the ISO string (with Z/offset) Postgres returns — these two are the only
// place that conversion happens.
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

function formatScheduled(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function InterviewForm({
  initial,
  matches,
  onSave,
  onCancel,
  saving,
}: {
  initial: InterviewInput;
  matches: MatchedJobRow[];
  onSave: (input: InterviewInput) => void;
  onCancel?: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<InterviewInput>(initial);
  const linkableMatches = matches.filter((m) => APPLIED_STATUSES.includes(m.status));

  function selectMatch(jobId: string) {
    if (!jobId) {
      setForm((f) => ({ ...f, job_id: null }));
      return;
    }
    const match = matches.find((m) => m.job_id === jobId);
    setForm((f) => ({
      ...f,
      job_id: jobId,
      company: match?.jobs?.company ?? f.company,
      role: match?.jobs?.title ?? f.role,
    }));
  }

  return (
    <div style={{ marginTop: "0.5rem" }}>
      {linkableMatches.length > 0 && (
        <select
          value={form.job_id ?? ""}
          onChange={(e) => selectMatch(e.target.value)}
          className="control-input"
          style={{ width: "100%", marginBottom: "0.6rem" }}
        >
          <option value="">Not linked to a tracked application</option>
          {linkableMatches.map((m) => (
            <option key={m.job_id} value={m.job_id}>
              {m.jobs?.title} — {m.jobs?.company}
            </option>
          ))}
        </select>
      )}
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.6rem", flexWrap: "wrap" }}>
        <input
          value={form.company}
          onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
          placeholder="Company"
          className="control-input"
          style={{ flex: 1, minWidth: 160 }}
        />
        <input
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          placeholder="Role"
          className="control-input"
          style={{ flex: 1, minWidth: 160 }}
        />
      </div>
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.6rem", flexWrap: "wrap" }}>
        <select
          value={form.stage}
          onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
          className="control-input"
          style={{ width: 160 }}
        >
          {INTERVIEW_STAGE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {INTERVIEW_STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={toLocalInputValue(form.scheduled_at)}
          onChange={(e) => setForm((f) => ({ ...f, scheduled_at: fromLocalInputValue(e.target.value) }))}
          className="control-input"
          style={{ width: 220 }}
        />
        <input
          value={form.meeting_link ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, meeting_link: e.target.value || null }))}
          placeholder="Meeting link (optional)"
          className="control-input"
          style={{ flex: 1, minWidth: 200 }}
        />
      </div>
      <textarea
        rows={4}
        value={form.notes}
        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        placeholder="Prep notes, interviewer names, questions asked..."
        style={{ marginBottom: "0.6rem" }}
      />
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="primary"
          disabled={saving || !form.company.trim() || !form.role.trim()}
          onClick={() => onSave(form)}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {onCancel && (
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function InterviewCard({
  interview,
  session,
  resumeText,
  onUpdate,
  onDelete,
}: {
  interview: Interview;
  session: Session;
  resumeText: string;
  onUpdate: (id: number, input: InterviewInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [prepOpen, setPrepOpen] = useState(false);
  const [prep, setPrep] = useState<{ loading: boolean; text: string; error: string | null } | null>(null);
  const stageLabel = INTERVIEW_STAGE_LABELS[interview.stage as InterviewStage] ?? interview.stage;

  async function runPrep() {
    setPrepOpen(true);
    if (!resumeText.trim()) {
      setPrep({ loading: false, text: "", error: "Add a default resume in the Resume Center first." });
      return;
    }
    setPrep({ loading: true, text: "", error: null });
    try {
      const res = await fetch("/api/interview-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          resumeText,
          company: interview.company,
          role: interview.role,
          stage: stageLabel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setPrep({ loading: false, text: data.prep, error: null });
      logActivity(session.user.id, "interview", String(interview.id), "interview_prepped", {
        company: interview.company,
        stage: stageLabel,
      });
    } catch (err) {
      setPrep({ loading: false, text: "", error: err instanceof Error ? err.message : "Something went wrong" });
    }
  }

  if (editing) {
    return (
      <div className="resume-version-card">
        {actionError && <p className="error">{actionError}</p>}
        <InterviewForm
          initial={interview}
          matches={[]}
          saving={busy}
          onCancel={() => setEditing(false)}
          onSave={async (input) => {
            setBusy(true);
            setActionError(null);
            try {
              await onUpdate(interview.id, input);
              setEditing(false);
            } catch (err) {
              setActionError(err instanceof Error ? err.message : "Couldn't save that change");
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="resume-version-card">
      <div className="resume-version-top">
        <div>
          <span className="title" style={{ marginRight: "0.4rem" }}>{interview.company}</span>
          <span className="badge badge-accent">{stageLabel}</span>
          <p className="hint" style={{ margin: "0.2rem 0 0" }}>{interview.role}</p>
        </div>
        <span className="hint" style={{ margin: 0, textAlign: "right" }}>
          {interview.scheduled_at ? formatScheduled(interview.scheduled_at) : "Time TBD"}
        </span>
      </div>

      {interview.meeting_link && (
        <a className="apply-link" href={interview.meeting_link} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: "0.5rem" }}>
          Join call →
        </a>
      )}

      {interview.notes && <p className="hint" style={{ margin: "0.5rem 0 0", whiteSpace: "pre-wrap" }}>{interview.notes}</p>}

      <div className="resume-version-actions">
        <button type="button" className="ghost icon-btn" onClick={() => (prepOpen ? setPrepOpen(false) : runPrep())}>
          <SparkleIcon size={14} />
          {prepOpen ? "Hide prep" : "Prep with AI"}
        </button>
        <button type="button" className="ghost" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setActionError(null);
            try {
              await onDelete(interview.id);
            } catch (err) {
              setActionError(err instanceof Error ? err.message : "Couldn't delete that interview");
            } finally {
              setBusy(false);
            }
          }}
        >
          Delete
        </button>
      </div>
      {actionError && <p className="error">{actionError}</p>}

      {prepOpen && (
        <div style={{ marginTop: "0.75rem" }}>
          {prep?.loading && <p className="hint" style={{ margin: 0 }}>Preparing...</p>}
          {prep?.error && <p className="error">{prep.error}</p>}
          {prep && !prep.loading && !prep.error && (
            <div>
              <p className="hint" style={{ whiteSpace: "pre-wrap", margin: "0 0 0.5rem" }}>{prep.text}</p>
              <button type="button" className="ghost" onClick={() => navigator.clipboard.writeText(prep.text)}>
                Copy
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function InterviewHub({
  interviews,
  matches,
  session,
  resumeText,
  onAdd,
  onUpdate,
  onDelete,
}: {
  interviews: Interview[];
  matches: MatchedJobRow[];
  session: Session;
  resumeText: string;
  onAdd: (input: InterviewInput) => Promise<void>;
  onUpdate: (id: number, input: InterviewInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const now = Date.now();
  const upcoming = interviews
    .filter((i) => i.scheduled_at && new Date(i.scheduled_at).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime());
  const needsScheduling = interviews.filter((i) => !i.scheduled_at);
  const past = interviews
    .filter((i) => i.scheduled_at && new Date(i.scheduled_at).getTime() < now)
    .sort((a, b) => new Date(b.scheduled_at!).getTime() - new Date(a.scheduled_at!).getTime());

  return (
    <div className="card">
      <div className="card-header-static">
        <h2 className="card-title-icon" style={{ margin: 0 }}>
          <CalendarIcon size={17} />
          Interview Hub
        </h2>
        {!addOpen && (
          <button type="button" className="ghost" onClick={() => setAddOpen(true)}>
            + Schedule interview
          </button>
        )}
      </div>

      {addOpen && (
        <div className="resume-version-card" style={{ marginTop: "0.85rem" }}>
          <InterviewForm
            initial={EMPTY_FORM}
            matches={matches}
            saving={saving}
            onCancel={() => setAddOpen(false)}
            onSave={async (input) => {
              setSaving(true);
              await onAdd(input);
              setSaving(false);
              setAddOpen(false);
            }}
          />
        </div>
      )}

      {interviews.length === 0 && !addOpen ? (
        <p className="empty-state" style={{ marginTop: "0.85rem" }}>
          No interviews yet — schedule one above once you land a phone screen or onsite.
        </p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <p className="hint" style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>Upcoming</p>
              <div className="resume-version-list">
                {upcoming.map((i) => (
                  <InterviewCard key={i.id} interview={i} session={session} resumeText={resumeText} onUpdate={onUpdate} onDelete={onDelete} />
                ))}
              </div>
            </div>
          )}
          {needsScheduling.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <p className="hint" style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>Needs a time</p>
              <div className="resume-version-list">
                {needsScheduling.map((i) => (
                  <InterviewCard key={i.id} interview={i} session={session} resumeText={resumeText} onUpdate={onUpdate} onDelete={onDelete} />
                ))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <p className="hint" style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>Past</p>
              <div className="resume-version-list">
                {past.map((i) => (
                  <InterviewCard key={i.id} interview={i} session={session} resumeText={resumeText} onUpdate={onUpdate} onDelete={onDelete} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

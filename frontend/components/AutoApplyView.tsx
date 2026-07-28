"use client";

import { useState } from "react";
import { AutoApplyQueueItem, AutoApplySettings, QUALITY_TIERS, ResumeVersion } from "@/lib/types";
import { SparkleIcon } from "@/components/icons";

const MAX_DAILY_CAP = 20;

/** Never submits anything — the app has no ATS integration or browser
 * automation to submit forms with, and deliberately doesn't build one
 * (account/ToS risk). "Enabled" only lets the server pre-draft a cover
 * letter + tailored resume (same Groq calls as the manual buttons
 * elsewhere) for matches at or above the quality bar, so they're ready to
 * review here. The user still clicks the job's real apply_url and applies
 * themselves — this only saves the drafting step. */
export function AutoApplyView({
  settings,
  resumeVersions,
  queueItems,
  running,
  runResult,
  onSaveSettings,
  onRunNow,
  onMarkApplied,
  onDismiss,
}: {
  settings: AutoApplySettings;
  resumeVersions: ResumeVersion[];
  queueItems: AutoApplyQueueItem[];
  running: boolean;
  runResult: string | null;
  onSaveSettings: (next: Partial<AutoApplySettings>) => Promise<void>;
  onRunNow: () => Promise<void>;
  onMarkApplied: (item: AutoApplyQueueItem) => Promise<void>;
  onDismiss: (item: AutoApplyQueueItem) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const queued = queueItems.filter((q) => q.status === "queued");
  const defaultVersion = resumeVersions.find((v) => v.is_default);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveSettings(draft);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save settings — try again");
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(item: AutoApplyQueueItem, action: (item: AutoApplyQueueItem) => Promise<void>) {
    setBusyId(item.id);
    await action(item);
    setBusyId(null);
  }

  return (
    <>
      <div className="card">
        <div className="card-header-static">
          <h2 className="card-title-icon" style={{ margin: 0 }}>
            <SparkleIcon size={17} />
            Auto Apply
          </h2>
        </div>
        <p className="hint" style={{ margin: "0.35rem 0 1rem" }}>
          Never submits anything on its own. When enabled, jobfit pre-drafts a cover letter and a
          tailored resume for new matches at or above your quality bar, so they&apos;re ready in the
          review queue below — you still click each job&apos;s real Apply link yourself.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <div>
            <button
              type="button"
              className={draft.enabled ? "primary" : "ghost"}
              onClick={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
            >
              {draft.enabled ? "Enabled" : "Disabled"}
            </button>
          </div>

          <div>
            <p className="hint" style={{ margin: "0 0 0.4rem" }}>Minimum match quality</p>
            <div className="preset-group">
              {QUALITY_TIERS.map((tier) => (
                <button
                  key={tier.label}
                  type="button"
                  className={draft.min_fit_score === tier.value ? "primary" : "ghost"}
                  style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }}
                  onClick={() => setDraft((d) => ({ ...d, min_fit_score: tier.value }))}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <p className="hint" style={{ margin: "0 0 0.4rem" }}>Daily cap</p>
              <input
                type="number"
                min={1}
                max={MAX_DAILY_CAP}
                value={draft.daily_cap}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, daily_cap: Math.min(MAX_DAILY_CAP, Math.max(1, Number(e.target.value) || 1)) }))
                }
                className="control-input"
                style={{ width: 100 }}
              />
            </div>
            <div>
              <p className="hint" style={{ margin: "0 0 0.4rem" }}>Resume used for drafts</p>
              <select
                value={draft.resume_version_id ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, resume_version_id: e.target.value ? Number(e.target.value) : null }))}
                className="control-input"
                style={{ width: 220 }}
              >
                <option value="">
                  Default ({defaultVersion?.title ?? "none set"})
                </option>
                {resumeVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button type="button" className="primary" disabled={!dirty || saving} onClick={handleSave}>
              {saving ? "Saving..." : "Save settings"}
            </button>
            <button type="button" className="ghost" disabled={!settings.enabled || running} onClick={onRunNow}>
              {running ? "Checking for matches..." : "Run now"}
            </button>
          </div>
          {saveError && (
            <p className="error" style={{ margin: 0 }}>
              {saveError}
            </p>
          )}
          {runResult && !running && (
            <p className={runResult.startsWith("Run failed") ? "error" : "hint"} style={{ margin: 0 }}>
              {runResult}
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header-static">
          <h2 style={{ margin: 0 }}>Review queue</h2>
          <span className="hint" style={{ margin: 0 }}>{queued.length} waiting on you</span>
        </div>

        {queued.length === 0 ? (
          <p className="empty-state">
            Nothing queued yet. {settings.enabled ? "Click “Run now” or check back after the next scheduled check." : "Enable Auto Apply above to start filling this in."}
          </p>
        ) : (
          <div className="resume-version-list" style={{ marginTop: "0.85rem" }}>
            {queued.map((item) => {
              const expanded = expandedId === item.id;
              return (
                <div className="resume-version-card" key={item.id}>
                  <div className="resume-version-top">
                    <div>
                      <span className="title" style={{ marginRight: "0.4rem" }}>{item.jobs?.title}</span>
                      <p className="hint" style={{ margin: "0.2rem 0 0" }}>{item.jobs?.company} · {item.jobs?.location}</p>
                    </div>
                    <span className="hint" style={{ margin: 0 }}>{new Date(item.created_at).toLocaleDateString("en-US")}</span>
                  </div>

                  <div className="resume-version-actions">
                    <button type="button" className="ghost" onClick={() => setExpandedId(expanded ? null : item.id)}>
                      {expanded ? "Hide drafts" : "Review drafts"}
                    </button>
                    {item.jobs?.apply_url && (
                      <a className="ghost" href={item.jobs.apply_url} target="_blank" rel="noreferrer">
                        Open apply page
                      </a>
                    )}
                    <button
                      type="button"
                      className="primary"
                      disabled={busyId === item.id}
                      onClick={() => handleAction(item, onMarkApplied)}
                    >
                      Mark as applied
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={busyId === item.id}
                      onClick={() => handleAction(item, onDismiss)}
                    >
                      Dismiss
                    </button>
                  </div>

                  {expanded && (
                    <div style={{ marginTop: "0.65rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                      <div>
                        <p className="hint" style={{ margin: "0 0 0.3rem", fontWeight: 600 }}>Cover letter</p>
                        <textarea rows={8} defaultValue={item.cover_letter_draft} readOnly />
                      </div>
                      <div>
                        <p className="hint" style={{ margin: "0 0 0.3rem", fontWeight: 600 }}>Tailored resume</p>
                        <textarea rows={8} defaultValue={item.tailored_resume_draft} readOnly />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

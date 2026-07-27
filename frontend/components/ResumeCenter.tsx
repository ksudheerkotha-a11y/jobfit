"use client";

import { useRef, useState } from "react";
import { ResumeVersion } from "@/lib/types";
import { parseResumeFile, UnsupportedResumeFileError } from "@/lib/parseResumeFile";
import { SparkleIcon } from "@/components/icons";

type AnalyzeState = { loading: boolean; error: string | null };

/** Multi-version resume management on top of resume_versions. The version
 * with is_default=true is what scoring, tailoring, and cover-letter drafts
 * use — page.tsx keeps the legacy `resumes` table (read by the Python
 * matcher) mirrored to whichever version is default, so this never requires
 * touching the ingestion pipeline. */
export function ResumeCenter({
  accessToken,
  versions,
  onAdd,
  onSetDefault,
  onUpdate,
  onDelete,
  onAnalyzed,
}: {
  accessToken: string;
  versions: ResumeVersion[];
  onAdd: (title: string, text: string) => Promise<void>;
  onSetDefault: (id: number) => Promise<void>;
  onUpdate: (id: number, text: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onAnalyzed: (id: number, atsScore: number, keywords: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(versions.length === 0);
  const [addOpen, setAddOpen] = useState(versions.length === 0);
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState<Record<number, AnalyzeState>>({});
  const [suggestionsById, setSuggestionsById] = useState<Record<number, string[]>>({});

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setParsing(true);
    setAddError(null);
    try {
      const extracted = await parseResumeFile(file);
      if (!extracted.trim()) {
        setAddError("Couldn't find any text in that file — try a different file, or paste your resume instead.");
      } else {
        setNewText(extracted);
        if (!newTitle.trim()) setNewTitle(file.name.replace(/\.[^.]+$/, ""));
      }
    } catch (err) {
      setAddError(err instanceof UnsupportedResumeFileError ? err.message : "Couldn't read that file. Try a different one, or paste your resume instead.");
    } finally {
      setParsing(false);
    }
  }

  async function handleAdd() {
    if (!newText.trim()) return;
    setSaving(true);
    setAddError(null);
    try {
      await onAdd(newTitle.trim() || "Untitled resume", newText);
      setNewTitle("");
      setNewText("");
      setAddOpen(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Couldn't save that resume version");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(v: ResumeVersion) {
    setEditingId(v.id);
    setEditText(v.resume_text);
  }

  async function saveEdit(id: number) {
    setBusyId(id);
    await onUpdate(id, editText);
    setBusyId(null);
    setEditingId(null);
  }

  async function handleAnalyze(v: ResumeVersion) {
    setAnalyzing((a) => ({ ...a, [v.id]: { loading: true, error: null } }));
    try {
      const res = await fetch("/api/analyze-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ resumeText: v.resume_text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      await onAnalyzed(v.id, data.atsScore, data.keywords);
      setSuggestionsById((s) => ({ ...s, [v.id]: data.suggestions ?? [] }));
      setAnalyzing((a) => ({ ...a, [v.id]: { loading: false, error: null } }));
    } catch (err) {
      setAnalyzing((a) => ({
        ...a,
        [v.id]: { loading: false, error: err instanceof Error ? err.message : "Analysis failed" },
      }));
    }
  }

  async function handleSetDefault(id: number) {
    setBusyId(id);
    await onSetDefault(id);
    setBusyId(null);
  }

  async function handleDelete(v: ResumeVersion) {
    setBusyId(v.id);
    await onDelete(v.id);
    setBusyId(null);
  }

  function sourceTitle(v: ResumeVersion): string | undefined {
    if (!v.source_resume_id) return undefined;
    return versions.find((x) => x.id === v.source_resume_id)?.title;
  }

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen((v) => !v)}>
        <div>
          <h2>Resume Center</h2>
          <p className="hint" style={{ marginBottom: 0 }}>
            {versions.length === 0
              ? "Upload or paste your resume to start getting matches."
              : `${versions.length} version${versions.length === 1 ? "" : "s"} — the default is what scoring and AI features use.`}
          </p>
        </div>
        <span className={`chevron ${open ? "open" : ""}`}>▾</span>
      </div>

      {open && (
        <div style={{ marginTop: "1rem" }}>
          {versions.length > 0 && (
            <div className="resume-version-list">
              {versions.map((v) => {
                const isEditing = editingId === v.id;
                const state = analyzing[v.id];
                const suggestions = suggestionsById[v.id];
                const src = sourceTitle(v);
                return (
                  <div className="resume-version-card" key={v.id}>
                    <div className="resume-version-top">
                      <div>
                        <span className="title" style={{ marginRight: "0.4rem" }}>{v.title}</span>
                        {v.is_default && <span className="badge badge-good">Default</span>}
                        {v.ats_score !== null && <span className="badge badge-accent">ATS {v.ats_score}</span>}
                        {src && <span className="hint" style={{ display: "block", marginTop: "0.2rem" }}>Tailored from &ldquo;{src}&rdquo;</span>}
                      </div>
                      <span className="hint" style={{ margin: 0 }}>
                        {new Date(v.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {v.keywords.length > 0 && (
                      <div className="pill-row" style={{ marginTop: "0.5rem" }}>
                        {v.keywords.slice(0, 8).map((k) => (
                          <span className="pill" key={k}>{k}</span>
                        ))}
                      </div>
                    )}

                    {suggestions && suggestions.length > 0 && (
                      <ul className="hint" style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
                        {suggestions.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    )}

                    {state?.error && <p className="error">{state.error}</p>}

                    {isEditing ? (
                      <div style={{ marginTop: "0.6rem" }}>
                        <textarea
                          rows={10}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          style={{ marginBottom: "0.5rem" }}
                        />
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button type="button" className="primary" disabled={busyId === v.id} onClick={() => saveEdit(v.id)}>
                            {busyId === v.id ? "Saving..." : "Save changes"}
                          </button>
                          <button type="button" className="ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="resume-version-actions">
                        {!v.is_default && (
                          <button type="button" className="ghost" disabled={busyId === v.id} onClick={() => handleSetDefault(v.id)}>
                            {busyId === v.id ? "Setting..." : "Set default"}
                          </button>
                        )}
                        <button type="button" className="ghost icon-btn" disabled={state?.loading} onClick={() => handleAnalyze(v)}>
                          <SparkleIcon size={14} />
                          {state?.loading ? "Analyzing..." : "Analyze"}
                        </button>
                        <button type="button" className="ghost" onClick={() => startEdit(v)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          disabled={v.is_default || versions.length <= 1 || busyId === v.id}
                          title={v.is_default ? "Set another version as default first" : versions.length <= 1 ? "This is your only resume" : undefined}
                          onClick={() => handleDelete(v)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {addOpen ? (
            <div style={{ marginTop: versions.length > 0 ? "1rem" : 0 }}>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder='Version name (e.g. "General", "PM-focused")'
                className="control-input"
                style={{ width: "100%", marginBottom: "0.6rem" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={parsing}>
                  {parsing ? "Reading file..." : "Upload PDF, Word, or text file"}
                </button>
                <span className="hint" style={{ margin: 0 }}>or paste it directly below</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
              </div>
              <textarea
                rows={10}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Paste resume text here, or use the upload button above..."
                style={{ marginBottom: "0.75rem" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <button className="primary" onClick={handleAdd} disabled={saving || parsing || !newText.trim()}>
                  {saving ? "Saving..." : "Save version"}
                </button>
                {versions.length > 0 && (
                  <button type="button" className="ghost" onClick={() => setAddOpen(false)}>
                    Cancel
                  </button>
                )}
              </div>
              {addError && <p className="error">{addError}</p>}
            </div>
          ) : (
            <button type="button" className="ghost" style={{ marginTop: "1rem" }} onClick={() => setAddOpen(true)}>
              + Add resume version
            </button>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { parseResumeFile, UnsupportedResumeFileError } from "@/lib/parseResumeFile";
import { logActivity } from "@/lib/logActivity";

export function ResumeForm({ userId, initialText }: { userId: string; initialText: string }) {
  const [text, setText] = useState(initialText);
  const [open, setOpen] = useState(!initialText.trim());
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setParsing(true);
    setError(null);
    try {
      const extracted = await parseResumeFile(file);
      if (!extracted.trim()) {
        setError("Couldn't find any text in that file — try a different file, or paste your resume instead.");
      } else {
        setText(extracted);
      }
    } catch (err) {
      setError(err instanceof UnsupportedResumeFileError ? err.message : "Couldn't read that file. Try a different one, or paste your resume instead.");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("resumes")
      .upsert({ user_id: userId, resume_text: text, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) {
      setError(error.message);
    } else {
      setSavedAt(new Date());
      setOpen(false);
      logActivity(userId, "resume", userId, "resume_updated", { length: text.length });
    }
  }

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen((v) => !v)}>
        <div>
          <h2>Your resume</h2>
          <p className="hint" style={{ marginBottom: 0 }}>
            {initialText.trim() ? "Saved — the next scheduled match run scores against this." : "Upload or paste your resume to start getting matches."}
          </p>
        </div>
        <span className={`chevron ${open ? "open" : ""}`}>▾</span>
      </div>

      {open && (
        <div style={{ marginTop: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
            >
              {parsing ? "Reading file..." : "Upload PDF, Word, or text file"}
            </button>
            <span className="hint" style={{ margin: 0 }}>
              or paste it directly below — whichever&apos;s easier
            </span>
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
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste resume text here, or use the upload button above..."
            style={{ marginBottom: "0.75rem" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button className="primary" onClick={handleSave} disabled={saving || parsing || !text.trim()}>
              {saving ? "Saving..." : "Save resume"}
            </button>
            {savedAt && <span className="hint" style={{ margin: 0 }}>Saved {savedAt.toLocaleTimeString()}</span>}
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}

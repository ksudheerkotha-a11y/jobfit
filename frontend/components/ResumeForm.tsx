"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function ResumeForm({ userId, initialText }: { userId: string; initialText: string }) {
  const [text, setText] = useState(initialText);
  const [open, setOpen] = useState(!initialText.trim());
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    }
  }

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen((v) => !v)}>
        <div>
          <h2>Your resume</h2>
          <p className="hint" style={{ marginBottom: 0 }}>
            {initialText.trim() ? "Saved — the next scheduled match run scores against this." : "Paste your resume to start getting matches."}
          </p>
        </div>
        <span className={`chevron ${open ? "open" : ""}`}>▾</span>
      </div>

      {open && (
        <div style={{ marginTop: "1rem" }}>
          <textarea
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste resume text here..."
            style={{ marginBottom: "0.75rem" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button className="primary" onClick={handleSave} disabled={saving || !text.trim()}>
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

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function ResumeForm({ userId, initialText }: { userId: string; initialText: string }) {
  const [text, setText] = useState(initialText);
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
    }
  }

  return (
    <div className="resume-form">
      <h2>Your resume</h2>
      <p className="hint">
        Paste your resume as plain text. The next scheduled match run scores every
        stored job against this.
      </p>
      <textarea
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste resume text here..."
      />
      <button onClick={handleSave} disabled={saving || !text.trim()}>
        {saving ? "Saving..." : "Save resume"}
      </button>
      {savedAt && <span className="hint"> Saved {savedAt.toLocaleTimeString()}</span>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

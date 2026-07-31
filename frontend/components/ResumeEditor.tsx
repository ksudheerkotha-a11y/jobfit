"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_FORMAT_PREFS,
  EducationEntry,
  ExperienceEntry,
  FormatPrefs,
  Profile,
  ProjectEntry,
  RESUME_FONTS,
  ResumeVersion,
  SkillEntry,
} from "@/lib/types";
import { downloadCoverLetterDocx, downloadResumeDocx } from "@/lib/generateResumeDocx";
import { SparkleIcon } from "@/components/icons";

type AnalyzeState = { loading: boolean; error: string | null; suggestions: string[] };

const SECTION_LABELS: Record<string, string> = {
  summary: "Summary",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  skills: "Skills",
};

function mergedPrefs(version: ResumeVersion | undefined): FormatPrefs {
  return { ...DEFAULT_FORMAT_PREFS, ...(version?.format_prefs ?? {}) };
}

/** The live document preview + formatting controls layer that sits above
 * the existing multi-version resume system (ResumeCenter, rendered right
 * below this on the page). Renders the caller's structured Profile data
 * (education/experience/skills/summary) when present — that's what makes
 * "Sections" reordering and template switching meaningful — and falls
 * back to the selected version's raw resume_text when Profile is empty,
 * so the preview is never a dead end. "Download" uses the browser's own
 * print dialog scoped to just the document via @media print, rather than
 * pulling in a PDF library for one button. */
export function ResumeEditor({
  versions,
  selectedId,
  onSelect,
  onAddVersion,
  onSetDefault,
  profile,
  email,
  education,
  experience,
  projects,
  skills,
  coverLetterText,
  accessToken,
  onSavePrefs,
  onSaveCoverLetter,
  onAnalyzed,
}: {
  versions: ResumeVersion[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAddVersion: () => Promise<void>;
  onSetDefault: (id: number) => Promise<void>;
  profile: Profile | null;
  email: string;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  skills: SkillEntry[];
  coverLetterText: string;
  accessToken: string;
  onSavePrefs: (id: number, prefs: Partial<FormatPrefs>) => Promise<void>;
  onSaveCoverLetter: (text: string) => Promise<void>;
  onAnalyzed: (id: number, atsScore: number, keywords: string[]) => Promise<void>;
}) {
  const [tab, setTab] = useState<"resume" | "cover-letter">("resume");
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [letterDraft, setLetterDraft] = useState(coverLetterText);
  const [savingLetter, setSavingLetter] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [docxError, setDocxError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<Record<number, AnalyzeState>>({});
  const letterDirty = letterDraft !== coverLetterText;

  const selected = versions.find((v) => v.id === selectedId) ?? versions.find((v) => v.is_default) ?? versions[0];
  const prefs = mergedPrefs(selected);
  const analyzeState = selected ? analyzing[selected.id] : undefined;

  const hasStructuredData =
    !!profile?.professional_summary.trim() ||
    education.length > 0 ||
    experience.length > 0 ||
    projects.length > 0 ||
    skills.length > 0;

  // A version tailored for a specific job (source_resume_id set) carries its
  // own complete, job-specific text — show that verbatim instead of the
  // generic live Profile document, even if it happens to be the default and
  // even though the user has structured Profile data. Otherwise every
  // tailored resume would render identically to the untailored one, which
  // defeats the point of tailoring it in the first place.
  const showStructuredDoc = hasStructuredData && !selected?.source_resume_id;

  const skillsByCategory = useMemo(() => {
    return skills.reduce<Record<string, SkillEntry[]>>((acc, s) => {
      (acc[s.category] ??= []).push(s);
      return acc;
    }, {});
  }, [skills]);

  async function updatePrefs(patch: Partial<FormatPrefs>) {
    if (!selected) return;
    await onSavePrefs(selected.id, { ...prefs, ...patch });
  }

  function moveSection(index: number, dir: -1 | 1) {
    const order = [...prefs.sectionOrder];
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    updatePrefs({ sectionOrder: order });
  }

  async function handleAnalyze() {
    if (!selected) return;
    const id = selected.id;
    setAnalyzing((a) => ({ ...a, [id]: { loading: true, error: null, suggestions: [] } }));
    try {
      const res = await fetch("/api/analyze-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ resumeText: selected.resume_text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      await onAnalyzed(id, data.atsScore, data.keywords);
      setAnalyzing((a) => ({ ...a, [id]: { loading: false, error: null, suggestions: data.suggestions ?? [] } }));
    } catch (err) {
      setAnalyzing((a) => ({
        ...a,
        [id]: { loading: false, error: err instanceof Error ? err.message : "Analysis failed", suggestions: [] },
      }));
    }
  }

  async function handleDownloadDocx() {
    setDownloadingDocx(true);
    setDocxError(null);
    try {
      if (tab === "cover-letter") {
        await downloadCoverLetterDocx(letterDraft, prefs);
      } else {
        await downloadResumeDocx(
          { profile, email, education, experience, projects, skills, prefs },
          showStructuredDoc,
          selected?.resume_text ?? ""
        );
      }
    } catch (err) {
      setDocxError(err instanceof Error ? err.message : "Couldn't generate that Word file — try again");
    } finally {
      setDownloadingDocx(false);
    }
  }

  if (versions.length === 0) {
    return (
      <div className="card">
        <p className="empty-state">Add a resume version below to start editing it here.</p>
      </div>
    );
  }

  return (
    <div className="card resume-editor-card">
      <div className="resume-editor-header">
        <div>
          <h2 className="card-title-icon" style={{ margin: 0 }}>
            Resume
            <span className="badge badge-muted">PDF · DOCX</span>
          </h2>
          <p className="hint" style={{ margin: "0.3rem 0 0" }}>
            Tweak how it reads and looks. jobfit remembers your rules and applies them everywhere.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.4rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="primary"
              style={{ padding: "0.4rem 0.9rem", whiteSpace: "nowrap" }}
              onClick={() => window.print()}
            >
              PDF
            </button>
            <button
              type="button"
              className="ghost"
              style={{ padding: "0.4rem 0.9rem", whiteSpace: "nowrap" }}
              disabled={downloadingDocx}
              onClick={handleDownloadDocx}
            >
              {downloadingDocx ? "Preparing..." : "Word (.docx)"}
            </button>
          </div>
          {docxError && (
            <p className="error" style={{ margin: 0, fontSize: "0.8125rem" }}>
              {docxError}
            </p>
          )}
        </div>
      </div>

      <div className="resume-version-row">
        <span className="hint" style={{ margin: 0, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.6875rem" }}>
          Version
        </span>
        {versions.map((v) => (
          <button
            key={v.id}
            type="button"
            className={v.id === selected?.id ? "primary icon-btn" : "ghost icon-btn"}
            style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }}
            onClick={() => onSelect(v.id)}
          >
            {v.is_default && "★ "}
            {v.title}
          </button>
        ))}
        <button
          type="button"
          className="ghost"
          style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }}
          disabled={adding}
          onClick={async () => {
            setAdding(true);
            await onAddVersion();
            setAdding(false);
          }}
        >
          + New
        </button>
        {selected && !selected.is_default && (
          <button
            type="button"
            className="icon-link"
            style={{ marginLeft: "auto" }}
            onClick={() => onSetDefault(selected.id)}
          >
            Set as default
          </button>
        )}
      </div>

      <div className="resume-toolbar">
        <div className="resume-toolbar-row">
          <div className="preset-group">
            <button type="button" className={tab === "resume" ? "primary" : "ghost"} style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }} onClick={() => setTab("resume")}>
              Resume
            </button>
            <button
              type="button"
              className={tab === "cover-letter" ? "primary" : "ghost"}
              style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }}
              onClick={() => setTab("cover-letter")}
            >
              Cover letter
            </button>
          </div>
          {selected?.is_default && (
            <span className="hint" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--good)", display: "inline-block" }} />
              Live — used for matching and AI drafts
            </span>
          )}
        </div>

        {tab === "resume" && (
          <div className="resume-toolbar-row">
            <div className="preset-group">
              <button
                type="button"
                className={prefs.template === "standard" ? "primary" : "ghost"}
                style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }}
                onClick={() => updatePrefs({ template: "standard" })}
              >
                Standard
              </button>
              <button
                type="button"
                className={prefs.template === "jake" ? "primary" : "ghost"}
                style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }}
                onClick={() => updatePrefs({ template: "jake" })}
              >
                Jake
              </button>
            </div>

            <select value={prefs.font} onChange={(e) => updatePrefs({ font: e.target.value })} className="control-input" style={{ width: 140 }}>
              {RESUME_FONTS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>

            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <button type="button" className="ghost" style={{ padding: "0.25rem 0.55rem" }} onClick={() => updatePrefs({ fontSize: Math.max(8, prefs.fontSize - 0.5) })}>
                −
              </button>
              <span className="hint" style={{ margin: 0, width: "3.2em", textAlign: "center" }}>{prefs.fontSize}pt</span>
              <button type="button" className="ghost" style={{ padding: "0.25rem 0.55rem" }} onClick={() => updatePrefs({ fontSize: Math.min(13, prefs.fontSize + 0.5) })}>
                +
              </button>
            </div>

            <div className="preset-group">
              <button
                type="button"
                className={prefs.align === "left" ? "primary" : "ghost"}
                style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }}
                onClick={() => updatePrefs({ align: "left" })}
              >
                Left
              </button>
              <button
                type="button"
                className={prefs.align === "justified" ? "primary" : "ghost"}
                style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }}
                onClick={() => updatePrefs({ align: "justified" })}
              >
                Justified
              </button>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8125rem" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={prefs.fitToOnePage} onChange={(e) => updatePrefs({ fitToOnePage: e.target.checked })} />
              Fit to one page
            </label>

            <div style={{ position: "relative" }}>
              <button type="button" className="ghost" style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }} onClick={() => setSectionsOpen((v) => !v)}>
                ↕ Sections
              </button>
              {sectionsOpen && (
                <div className="resume-sections-popover">
                  {prefs.sectionOrder.map((key, i) => (
                    <div key={key} className="resume-sections-row">
                      <span>{SECTION_LABELS[key] ?? key}</span>
                      <div style={{ display: "flex", gap: "0.2rem" }}>
                        <button type="button" className="ghost" style={{ padding: "0.15rem 0.4rem" }} disabled={i === 0} onClick={() => moveSection(i, -1)}>
                          ↑
                        </button>
                        <button type="button" className="ghost" style={{ padding: "0.15rem 0.4rem" }} disabled={i === prefs.sectionOrder.length - 1} onClick={() => moveSection(i, 1)}>
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {tab === "resume" && selected && (
        <div style={{ background: "var(--page-plane)", borderRadius: 12, padding: "0.9rem 1rem", marginBottom: "1rem" }}>
          <div className="focus-banner">
            <div className="focus-banner-copy">
              <span className="focus-banner-icon">
                <SparkleIcon size={18} />
              </span>
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {selected.ats_score !== null ? `ATS score: ${selected.ats_score}/100` : "Check your ATS compatibility"}
                </p>
                <p className="hint" style={{ margin: 0 }}>
                  {selected.ats_score !== null
                    ? "How well this resume parses for applicant tracking systems, with quick fixes below."
                    : "See how a resume-screening bot would read this, plus specific fixes — takes a few seconds."}
                </p>
              </div>
            </div>
            <button type="button" className={selected.ats_score !== null ? "ghost" : "primary"} disabled={analyzeState?.loading} onClick={handleAnalyze}>
              {analyzeState?.loading ? "Analyzing..." : selected.ats_score !== null ? "Re-analyze" : "Analyze"}
            </button>
          </div>
          {analyzeState?.error && (
            <p className="error" style={{ marginTop: "0.6rem" }}>
              {analyzeState.error}
            </p>
          )}
          {selected.keywords.length > 0 && (
            <div className="pill-row" style={{ marginTop: "0.6rem" }}>
              {selected.keywords.slice(0, 10).map((k) => (
                <span className="pill" key={k}>
                  {k}
                </span>
              ))}
            </div>
          )}
          {analyzeState?.suggestions && analyzeState.suggestions.length > 0 && (
            <ul className="hint" style={{ margin: "0.6rem 0 0", paddingLeft: "1.1rem" }}>
              {analyzeState.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="resume-doc-frame">
        {tab === "cover-letter" ? (
          <div className={`resume-doc resume-doc-${prefs.template}`} style={{ fontFamily: prefs.font, fontSize: `${prefs.fontSize}pt` }}>
            <textarea
              rows={18}
              className="resume-doc-textarea"
              value={letterDraft}
              onChange={(e) => setLetterDraft(e.target.value)}
              placeholder="Your default cover letter — a template you tailor per application..."
            />
            {letterDirty && (
              <button
                type="button"
                className="primary"
                style={{ marginTop: "0.75rem" }}
                disabled={savingLetter}
                onClick={async () => {
                  setSavingLetter(true);
                  setLetterError(null);
                  try {
                    await onSaveCoverLetter(letterDraft);
                  } catch (err) {
                    setLetterError(err instanceof Error ? err.message : "Couldn't save your cover letter");
                  } finally {
                    setSavingLetter(false);
                  }
                }}
              >
                {savingLetter ? "Saving..." : "Save"}
              </button>
            )}
            {letterError && <p className="error" style={{ marginTop: "0.5rem" }}>{letterError}</p>}
          </div>
        ) : showStructuredDoc ? (
          <div
            className={`resume-doc resume-doc-${prefs.template} ${prefs.fitToOnePage ? "resume-doc-fit" : ""}`}
            style={{ fontFamily: prefs.font, fontSize: `${prefs.fontSize}pt`, textAlign: prefs.align === "justified" ? "justify" : "left" }}
          >
            <div className="resume-doc-name">{profile?.full_name || "Your name"}</div>
            <div className="resume-doc-contact">
              {[profile?.location, email, profile?.phone, profile?.linkedin_url].filter(Boolean).join(" · ")}
            </div>
            {prefs.sectionOrder.map((key) => {
              if (key === "summary" && profile?.professional_summary.trim()) {
                return (
                  <section key={key} className="resume-doc-section">
                    <h3>Summary</h3>
                    <p>{profile.professional_summary}</p>
                  </section>
                );
              }
              if (key === "experience" && experience.length > 0) {
                return (
                  <section key={key} className="resume-doc-section">
                    <h3>Experience</h3>
                    {experience.map((e) => (
                      <div key={e.id} className="resume-doc-entry">
                        <div className="resume-doc-entry-top">
                          <strong>{e.title}{e.company && `, ${e.company}`}</strong>
                          <span>{e.start_date}{e.start_date && "–"}{e.end_date || "Present"}</span>
                        </div>
                        {e.bullets.length > 0 && (
                          <ul>
                            {e.bullets.map((b, i) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </section>
                );
              }
              if (key === "projects" && projects.length > 0) {
                return (
                  <section key={key} className="resume-doc-section">
                    <h3>Projects</h3>
                    {projects.map((p) => (
                      <div key={p.id} className="resume-doc-entry">
                        <div className="resume-doc-entry-top">
                          <strong>{p.title}</strong>
                          {p.link && <span>{p.link}</span>}
                        </div>
                        {p.description && <p style={{ margin: "0.15rem 0" }}>{p.description}</p>}
                        {p.bullets.length > 0 && (
                          <ul>
                            {p.bullets.map((b, i) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </section>
                );
              }
              if (key === "education" && education.length > 0) {
                return (
                  <section key={key} className="resume-doc-section">
                    <h3>Education</h3>
                    {education.map((e) => (
                      <div key={e.id} className="resume-doc-entry-top">
                        <strong>{e.degree}{e.field && `, ${e.field}`}</strong>
                        <span>{e.school}</span>
                      </div>
                    ))}
                  </section>
                );
              }
              if (key === "skills" && skills.length > 0) {
                return (
                  <section key={key} className="resume-doc-section">
                    <h3>Skills</h3>
                    {Object.entries(skillsByCategory).map(([cat, items]) => (
                      <p key={cat} style={{ margin: "0.2rem 0" }}>
                        <strong>{cat}: </strong>
                        {items.map((s) => s.skill).join(", ")}
                      </p>
                    ))}
                  </section>
                );
              }
              return null;
            })}
            <p className="hint resume-doc-hint">
              Built from your <Link href="/profile">Profile</Link> — add more there to fill this out.
            </p>
          </div>
        ) : (
          <div className={`resume-doc resume-doc-${prefs.template}`} style={{ fontFamily: prefs.font, fontSize: `${prefs.fontSize}pt` }}>
            <pre className="resume-doc-plaintext">{selected?.resume_text || "No resume text yet."}</pre>
            <p className="hint resume-doc-hint">
              {selected?.source_resume_id
                ? "This version was tailored for a specific job — download it as PDF or Word and use it for that application."
                : (
                  <>
                    Showing the raw text for this version — fill out your <Link href="/profile">Profile</Link> for a
                    formatted document instead.
                  </>
                )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

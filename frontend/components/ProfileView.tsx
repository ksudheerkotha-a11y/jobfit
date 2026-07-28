"use client";

import { useState } from "react";
import { EducationEntry, ExperienceEntry, Profile, ProjectEntry, ResumeVersion, SkillEntry } from "@/lib/types";
import { UsersIcon, MailIcon, SparkleIcon } from "@/components/icons";
import Link from "next/link";

type EducationInput = Omit<EducationEntry, "id" | "sort_order">;
type ExperienceInput = Omit<ExperienceEntry, "id" | "sort_order">;
type ProjectInput = Omit<ProjectEntry, "id" | "sort_order">;

const DEFAULT_CATEGORIES = ["Soft Skills", "Frameworks & Libraries", "Databases", "Tools & Software", "Languages"];

function initials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function completionScore(
  profile: Profile,
  hasResume: boolean,
  education: EducationEntry[],
  experience: ExperienceEntry[],
  skills: SkillEntry[]
): number {
  const checks = [
    !!profile.full_name.trim(),
    !!profile.location.trim(),
    !!profile.phone.trim(),
    !!profile.professional_summary.trim(),
    hasResume,
    education.length > 0,
    experience.length > 0,
    skills.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function ProfileView({
  profile,
  email,
  education,
  experience,
  projects,
  skills,
  resumeVersions,
  coverLetterText,
  importing,
  onSaveProfile,
  onImportFromResume,
  onAddEducation,
  onDeleteEducation,
  onAddExperience,
  onDeleteExperience,
  onAddProject,
  onDeleteProject,
  onAddSkill,
  onDeleteSkill,
  onSaveCoverLetter,
}: {
  profile: Profile;
  email: string;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  skills: SkillEntry[];
  resumeVersions: ResumeVersion[];
  coverLetterText: string;
  importing: boolean;
  onSaveProfile: (patch: Partial<Profile>) => Promise<void>;
  onImportFromResume: () => Promise<void>;
  onAddEducation: (input: EducationInput) => Promise<void>;
  onDeleteEducation: (id: number) => Promise<void>;
  onAddExperience: (input: ExperienceInput) => Promise<void>;
  onDeleteExperience: (id: number) => Promise<void>;
  onAddProject: (input: ProjectInput) => Promise<void>;
  onDeleteProject: (id: number) => Promise<void>;
  onAddSkill: (category: string, skill: string) => Promise<void>;
  onDeleteSkill: (id: number) => Promise<void>;
  onSaveCoverLetter: (text: string) => Promise<void>;
}) {
  const defaultVersion = resumeVersions.find((v) => v.is_default);
  const pct = completionScore(profile, !!defaultVersion, education, experience, skills);

  return (
    <>
      <div className="three-col-grid">
        <IdentityCard profile={profile} email={email} pct={pct} onSave={onSaveProfile} />
        <div className="card">
          <p className="card-title-icon" style={{ margin: 0, fontWeight: 700 }}>
            Resume
          </p>
          <p className="hint" style={{ margin: "0.4rem 0 0.75rem" }}>
            {defaultVersion ? `Default: "${defaultVersion.title}"` : "No default resume yet."}
          </p>
          <Link href="/resume" className="icon-link">
            Edit in Resume Center →
          </Link>
        </div>
        <CoverLetterCard text={coverLetterText} onSave={onSaveCoverLetter} />
      </div>

      <div className="card">
        <div className="card-header-static">
          <h2 style={{ margin: 0 }}>Professional summary</h2>
        </div>
        <SummaryEditor value={profile.professional_summary} onSave={(text) => onSaveProfile({ professional_summary: text })} />
        <button type="button" className="ghost icon-btn" style={{ marginTop: "0.75rem" }} disabled={importing} onClick={onImportFromResume}>
          <SparkleIcon size={14} />
          {importing ? "Importing..." : "Import from resume"}
        </button>
        <p className="hint" style={{ margin: "0.4rem 0 0" }}>
          Pulls summary, education, experience, and skills out of your default resume as a starting
          point — never overwrites what you already have here, only adds to it.
        </p>
      </div>

      <div className="two-col-grid">
        <div>
          <ExperienceSection entries={experience} onAdd={onAddExperience} onDelete={onDeleteExperience} />
          <ProjectsSection entries={projects} onAdd={onAddProject} onDelete={onDeleteProject} />
          <EducationSection entries={education} onAdd={onAddEducation} onDelete={onDeleteEducation} />
        </div>
        <div>
          <ApplicationDefaultsCard profile={profile} onSave={onSaveProfile} />
          <SkillsSection skills={skills} onAdd={onAddSkill} onDelete={onDeleteSkill} />
        </div>
      </div>
    </>
  );
}

function IdentityCard({
  profile,
  email,
  pct,
  onSave,
}: {
  profile: Profile;
  email: string;
  pct: number;
  onSave: (patch: Partial<Profile>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="card">
        <input
          value={draft.full_name}
          onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
          placeholder="Full name"
          style={{ marginBottom: "0.5rem" }}
        />
        <input
          value={draft.location}
          onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
          placeholder="Location"
          style={{ marginBottom: "0.5rem" }}
        />
        <input
          value={draft.phone}
          onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
          placeholder="Phone"
          style={{ marginBottom: "0.5rem" }}
        />
        <input
          value={draft.linkedin_url}
          onChange={(e) => setDraft((d) => ({ ...d, linkedin_url: e.target.value }))}
          placeholder="LinkedIn URL"
          style={{ marginBottom: "0.5rem" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.75rem", fontSize: "0.875rem" }}>
          <input
            type="checkbox"
            checked={draft.open_to_work}
            onChange={(e) => setDraft((d) => ({ ...d, open_to_work: e.target.checked }))}
            style={{ width: "auto" }}
          />
          Open to work
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="primary" disabled={saving} onClick={handleSave}>
            Save
          </button>
          <button type="button" className="ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "var(--text-primary)",
            color: "var(--surface-card)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "0.875rem",
            flexShrink: 0,
          }}
        >
          {initials(profile.full_name, email)}
        </span>
        <div>
          <p style={{ margin: 0, fontWeight: 700 }}>{profile.full_name || "Add your name"}</p>
          <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.2rem" }}>
            {profile.open_to_work && <span className="badge badge-good">Open to work</span>}
            <span className="badge badge-accent">{pct}% complete</span>
          </div>
        </div>
      </div>
      <p className="hint" style={{ margin: "0 0 0.75rem" }}>
        {email}
        {profile.phone && ` · ${profile.phone}`}
        {profile.location && ` · ${profile.location}`}
        {profile.linkedin_url && ` · ${profile.linkedin_url}`}
      </p>
      <button type="button" className="ghost icon-link" onClick={() => setEditing(true)}>
        Edit →
      </button>
    </div>
  );
}

function CoverLetterCard({ text, onSave }: { text: string; onSave: (text: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="card">
      <p className="card-title-icon" style={{ margin: 0, fontWeight: 700 }}>
        <MailIcon size={15} /> Cover letter
      </p>
      {editing ? (
        <>
          <textarea
            rows={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="A generic template you can start each application from..."
            style={{ margin: "0.5rem 0" }}
          />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="primary" disabled={saving} onClick={handleSave}>
              Save
            </button>
            <button type="button" className="ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint" style={{ margin: "0.4rem 0 0.75rem" }}>
            {text.trim() ? "Default letter, tailored per application." : "No default letter yet."}
          </p>
          <button type="button" className="ghost icon-link" onClick={() => setEditing(true)}>
            Edit →
          </button>
        </>
      )}
    </div>
  );
}

function SummaryEditor({ value, onSave }: { value: string; onSave: (text: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const dirty = draft !== value;

  return (
    <div>
      <textarea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="A 2-3 sentence summary recruiters see first..." />
      {dirty && (
        <button
          type="button"
          className="primary"
          style={{ marginTop: "0.5rem" }}
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSave(draft);
            setSaving(false);
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      )}
    </div>
  );
}

function EducationSection({
  entries,
  onAdd,
  onDelete,
}: {
  entries: EducationEntry[];
  onAdd: (input: EducationInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<EducationInput>({ school: "", degree: "", field: "", start_date: "", end_date: "" });
  const [saving, setSaving] = useState(false);

  return (
    <div className="card">
      <div className="card-header-static">
        <h2 style={{ margin: 0 }}>Education</h2>
        <span className="hint" style={{ margin: 0 }}>{entries.length} {entries.length === 1 ? "entry" : "entries"}</span>
      </div>

      {entries.length === 0 && !addOpen && <p className="empty-state">No education added yet.</p>}

      <div className="resume-version-list" style={{ marginTop: entries.length > 0 ? "0.85rem" : 0 }}>
        {entries.map((e) => (
          <div className="resume-version-card" key={e.id}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              {e.degree}
              {e.field && `, ${e.field}`}
            </p>
            <p className="hint" style={{ margin: "0.15rem 0 0" }}>
              {e.school} {e.start_date && `· ${e.start_date}–${e.end_date || "Present"}`}
            </p>
            <div className="resume-version-actions">
              <button type="button" className="ghost" onClick={() => onDelete(e.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {addOpen ? (
        <div className="resume-version-card" style={{ marginTop: "0.85rem" }}>
          <input value={draft.school} onChange={(ev) => setDraft((d) => ({ ...d, school: ev.target.value }))} placeholder="School" style={{ marginBottom: "0.4rem" }} />
          <input value={draft.degree} onChange={(ev) => setDraft((d) => ({ ...d, degree: ev.target.value }))} placeholder="Degree" style={{ marginBottom: "0.4rem" }} />
          <input value={draft.field} onChange={(ev) => setDraft((d) => ({ ...d, field: ev.target.value }))} placeholder="Field of study" style={{ marginBottom: "0.4rem" }} />
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.6rem" }}>
            <input value={draft.start_date} onChange={(ev) => setDraft((d) => ({ ...d, start_date: ev.target.value }))} placeholder="Start year" />
            <input value={draft.end_date} onChange={(ev) => setDraft((d) => ({ ...d, end_date: ev.target.value }))} placeholder="End year" />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="primary"
              disabled={saving || !draft.school.trim()}
              onClick={async () => {
                setSaving(true);
                await onAdd(draft);
                setSaving(false);
                setDraft({ school: "", degree: "", field: "", start_date: "", end_date: "" });
                setAddOpen(false);
              }}
            >
              Add
            </button>
            <button type="button" className="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="ghost" style={{ marginTop: "0.85rem" }} onClick={() => setAddOpen(true)}>
          + Add education
        </button>
      )}
    </div>
  );
}

function ExperienceSection({
  entries,
  onAdd,
  onDelete,
}: {
  entries: ExperienceEntry[];
  onAdd: (input: ExperienceInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const empty: ExperienceInput = { title: "", company: "", location: "", start_date: "", end_date: "", bullets: [] };
  const [draft, setDraft] = useState<ExperienceInput>(empty);
  const [bulletsText, setBulletsText] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="card">
      <div className="card-header-static">
        <h2 style={{ margin: 0 }}>Experience</h2>
        <span className="hint" style={{ margin: 0 }}>{entries.length} {entries.length === 1 ? "role" : "roles"}</span>
      </div>

      {entries.length === 0 && !addOpen && <p className="empty-state">No experience added yet.</p>}

      <div className="resume-version-list" style={{ marginTop: entries.length > 0 ? "0.85rem" : 0 }}>
        {entries.map((e) => (
          <div className="resume-version-card" key={e.id}>
            <p style={{ margin: 0, fontWeight: 600 }}>{e.title}</p>
            <p className="hint" style={{ margin: "0.15rem 0 0" }}>
              {e.company}
              {e.location && ` · ${e.location}`}
              {e.start_date && ` · ${e.start_date}–${e.end_date || "Present"}`}
            </p>
            {e.bullets.length > 0 && (
              <ul className="hint" style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
                {e.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
            <div className="resume-version-actions">
              <button type="button" className="ghost" onClick={() => onDelete(e.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {addOpen ? (
        <div className="resume-version-card" style={{ marginTop: "0.85rem" }}>
          <input value={draft.title} onChange={(ev) => setDraft((d) => ({ ...d, title: ev.target.value }))} placeholder="Title" style={{ marginBottom: "0.4rem" }} />
          <input value={draft.company} onChange={(ev) => setDraft((d) => ({ ...d, company: ev.target.value }))} placeholder="Company" style={{ marginBottom: "0.4rem" }} />
          <input value={draft.location} onChange={(ev) => setDraft((d) => ({ ...d, location: ev.target.value }))} placeholder="Location" style={{ marginBottom: "0.4rem" }} />
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem" }}>
            <input value={draft.start_date} onChange={(ev) => setDraft((d) => ({ ...d, start_date: ev.target.value }))} placeholder="Start (e.g. Jun 2022)" />
            <input value={draft.end_date} onChange={(ev) => setDraft((d) => ({ ...d, end_date: ev.target.value }))} placeholder="End (or Present)" />
          </div>
          <textarea
            rows={4}
            value={bulletsText}
            onChange={(ev) => setBulletsText(ev.target.value)}
            placeholder="One bullet per line..."
            style={{ marginBottom: "0.6rem" }}
          />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="primary"
              disabled={saving || !draft.title.trim()}
              onClick={async () => {
                setSaving(true);
                const bullets = bulletsText.split("\n").map((b) => b.trim()).filter(Boolean);
                await onAdd({ ...draft, bullets });
                setSaving(false);
                setDraft(empty);
                setBulletsText("");
                setAddOpen(false);
              }}
            >
              Add
            </button>
            <button type="button" className="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="ghost" style={{ marginTop: "0.85rem" }} onClick={() => setAddOpen(true)}>
          + Add experience
        </button>
      )}
    </div>
  );
}

function ProjectsSection({
  entries,
  onAdd,
  onDelete,
}: {
  entries: ProjectEntry[];
  onAdd: (input: ProjectInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const empty: ProjectInput = { title: "", description: "", link: "", bullets: [] };
  const [draft, setDraft] = useState<ProjectInput>(empty);
  const [bulletsText, setBulletsText] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="card">
      <div className="card-header-static">
        <h2 style={{ margin: 0 }}>Projects</h2>
        <span className="hint" style={{ margin: 0 }}>{entries.length} {entries.length === 1 ? "project" : "projects"}</span>
      </div>

      {entries.length === 0 && !addOpen && <p className="empty-state">No projects added yet.</p>}

      <div className="resume-version-list" style={{ marginTop: entries.length > 0 ? "0.85rem" : 0 }}>
        {entries.map((p) => (
          <div className="resume-version-card" key={p.id}>
            <p style={{ margin: 0, fontWeight: 600 }}>{p.title}</p>
            {(p.description || p.link) && (
              <p className="hint" style={{ margin: "0.15rem 0 0" }}>
                {p.description}
                {p.link && ` · ${p.link}`}
              </p>
            )}
            {p.bullets.length > 0 && (
              <ul className="hint" style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
                {p.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
            <div className="resume-version-actions">
              <button type="button" className="ghost" onClick={() => onDelete(p.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {addOpen ? (
        <div className="resume-version-card" style={{ marginTop: "0.85rem" }}>
          <input value={draft.title} onChange={(ev) => setDraft((d) => ({ ...d, title: ev.target.value }))} placeholder="Project name" style={{ marginBottom: "0.4rem" }} />
          <input value={draft.description} onChange={(ev) => setDraft((d) => ({ ...d, description: ev.target.value }))} placeholder="One-line description" style={{ marginBottom: "0.4rem" }} />
          <input value={draft.link} onChange={(ev) => setDraft((d) => ({ ...d, link: ev.target.value }))} placeholder="Link (optional)" style={{ marginBottom: "0.4rem" }} />
          <textarea
            rows={4}
            value={bulletsText}
            onChange={(ev) => setBulletsText(ev.target.value)}
            placeholder="One bullet per line..."
            style={{ marginBottom: "0.6rem" }}
          />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="primary"
              disabled={saving || !draft.title.trim()}
              onClick={async () => {
                setSaving(true);
                const bullets = bulletsText.split("\n").map((b) => b.trim()).filter(Boolean);
                await onAdd({ ...draft, bullets });
                setSaving(false);
                setDraft(empty);
                setBulletsText("");
                setAddOpen(false);
              }}
            >
              Add
            </button>
            <button type="button" className="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="ghost" style={{ marginTop: "0.85rem" }} onClick={() => setAddOpen(true)}>
          + Add project
        </button>
      )}
    </div>
  );
}

function ApplicationDefaultsCard({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (patch: Partial<Profile>) => Promise<void>;
}) {
  const groups: { label: string; keys: (keyof Profile)[] }[] = [
    { label: "Work authorization", keys: ["work_authorized", "needs_sponsorship"] },
    { label: "Work preferences", keys: ["in_person_ok", "can_relocate", "start_immediately", "has_transport", "needs_accommodations"] },
    { label: "Background", keys: ["prior_employee", "gov_clearance", "gov_ties"] },
  ];
  const fieldLabels: Record<string, string> = {
    work_authorized: "Authorized to work",
    needs_sponsorship: "Needs sponsorship",
    in_person_ok: "In-person OK",
    can_relocate: "Can relocate",
    start_immediately: "Start immediately",
    has_transport: "Has transport",
    needs_accommodations: "Needs accommodations",
    prior_employee: "Prior employee",
    gov_clearance: "Gov clearance",
    gov_ties: "Gov ties",
  };

  return (
    <div className="card">
      <div className="card-header-static">
        <h2 className="card-title-icon" style={{ margin: 0 }}>
          <UsersIcon size={16} /> Application defaults
        </h2>
      </div>
      <p className="hint" style={{ margin: "0.35rem 0 0.85rem" }}>
        What jobfit would autofill on real application forms in the future — nothing submits with
        this today.
      </p>
      {groups.map((g) => (
        <div key={g.label} style={{ marginBottom: "0.85rem" }}>
          <p className="hint" style={{ margin: "0 0 0.4rem", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.6875rem" }}>
            {g.label}
          </p>
          <div className="pill-row">
            {g.keys.map((key) => {
              const active = !!profile[key];
              return (
                <button
                  key={key}
                  type="button"
                  className={active ? "primary" : "ghost"}
                  style={{ padding: "0.3rem 0.75rem", fontSize: "0.8125rem" }}
                  onClick={() => onSave({ [key]: !active } as Partial<Profile>)}
                >
                  {active ? "✓ " : ""}
                  {fieldLabels[key]}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SkillsSection({
  skills,
  onAdd,
  onDelete,
}: {
  skills: SkillEntry[];
  onAdd: (category: string, skill: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [skill, setSkill] = useState("");
  const [saving, setSaving] = useState(false);

  const grouped = skills.reduce<Record<string, SkillEntry[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});
  const categories = Object.keys(grouped);

  return (
    <div className="card">
      <div className="card-header-static">
        <h2 style={{ margin: 0 }}>Skills</h2>
        <span className="hint" style={{ margin: 0 }}>
          {skills.length} across {categories.length || 0} {categories.length === 1 ? "category" : "categories"}
        </span>
      </div>

      {categories.length === 0 && !addOpen && <p className="empty-state">No skills added yet.</p>}

      {categories.map((cat) => (
        <div key={cat} style={{ marginTop: "0.85rem" }}>
          <p className="hint" style={{ margin: "0 0 0.35rem", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.6875rem" }}>
            {cat}
          </p>
          <div className="pill-row">
            {grouped[cat].map((s) => (
              <span className="pill" key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                {s.skill}
                <button
                  type="button"
                  onClick={() => onDelete(s.id)}
                  aria-label={`Remove ${s.skill}`}
                  style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      ))}

      {addOpen ? (
        <div style={{ marginTop: "0.85rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="control-input" style={{ width: 180 }}>
            {DEFAULT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="Skill" className="control-input" style={{ width: 140 }} />
          <button
            type="button"
            className="primary"
            disabled={saving || !skill.trim()}
            onClick={async () => {
              setSaving(true);
              await onAdd(category, skill.trim());
              setSaving(false);
              setSkill("");
            }}
          >
            Add
          </button>
          <button type="button" className="ghost" onClick={() => setAddOpen(false)}>
            Done
          </button>
        </div>
      ) : (
        <button type="button" className="ghost" style={{ marginTop: "0.85rem" }} onClick={() => setAddOpen(true)}>
          + Add skill
        </button>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { EducationEntry, ExperienceEntry, Profile, ProjectEntry, ResumeVersion, SkillEntry } from "@/lib/types";
import { logActivity } from "@/lib/logActivity";
import { SignIn } from "@/components/SignIn";
import { AppHeader } from "@/components/AppHeader";
import { ProfileView } from "@/components/ProfileView";
import { Logomark } from "@/components/icons";

// Per-user (auth session, profile data) — never static.
export const dynamic = "force-dynamic";

const DEFAULT_PROFILE: Profile = {
  full_name: "",
  open_to_work: true,
  location: "",
  phone: "",
  linkedin_url: "",
  professional_summary: "",
  work_authorized: false,
  needs_sponsorship: false,
  in_person_ok: false,
  can_relocate: false,
  start_immediately: false,
  has_transport: false,
  needs_accommodations: false,
  prior_employee: false,
  gov_clearance: false,
  gov_ties: false,
  updated_at: new Date().toISOString(),
};

type EducationInput = Omit<EducationEntry, "id" | "sort_order">;
type ExperienceInput = Omit<ExperienceEntry, "id" | "sort_order">;
type ProjectInput = Omit<ProjectEntry, "id" | "sort_order">;

export default function ProfilePage() {
  const { session, loadingSession } = useSession();
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [education, setEducation] = useState<EducationEntry[]>([]);
  const [experience, setExperience] = useState<ExperienceEntry[]>([]);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [resumeVersions, setResumeVersions] = useState<ResumeVersion[]>([]);
  const [coverLetterId, setCoverLetterId] = useState<number | null>(null);
  const [coverLetterText, setCoverLetterText] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setLoadingData(true);

    Promise.all([
      supabase.from("profile").select("*").maybeSingle(),
      supabase.from("profile_education").select("*").order("sort_order"),
      supabase.from("profile_experience").select("*").order("sort_order"),
      supabase.from("profile_projects").select("*").order("sort_order"),
      supabase.from("profile_skills").select("*").order("category").order("sort_order"),
      supabase.from("resume_versions").select("*"),
      supabase.from("cover_letters").select("id, edited_content").is("job_id", null).maybeSingle(),
    ]).then(([profileRes, eduRes, expRes, projectsRes, skillsRes, versionsRes, letterRes]) => {
      setProfile((profileRes.data as Profile) ?? DEFAULT_PROFILE);
      setEducation((eduRes.data as EducationEntry[]) ?? []);
      setExperience((expRes.data as ExperienceEntry[]) ?? []);
      setProjects((projectsRes.data as ProjectEntry[]) ?? []);
      setSkills((skillsRes.data as SkillEntry[]) ?? []);
      setResumeVersions((versionsRes.data as ResumeVersion[]) ?? []);
      setCoverLetterId((letterRes.data?.id as number) ?? null);
      setCoverLetterText(letterRes.data?.edited_content ?? "");
      setLoadingData(false);
    });
  }, [session]);

  async function handleSaveProfile(patch: Partial<Profile>) {
    if (!session) return;
    const merged = { ...profile, ...patch, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("profile").upsert({ user_id: session.user.id, ...merged });
    if (error) throw new Error(error.message);
    setProfile(merged);
    logActivity(session.user.id, "profile", session.user.id, "profile_updated", {});
  }

  async function handleAddEducation(input: EducationInput) {
    if (!session) return;
    const { data, error } = await supabase
      .from("profile_education")
      .insert({ user_id: session.user.id, ...input, sort_order: education.length })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    setEducation((prev) => [...prev, data as EducationEntry]);
  }

  async function handleDeleteEducation(id: number) {
    const { error } = await supabase.from("profile_education").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setEducation((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleAddExperience(input: ExperienceInput) {
    if (!session) return;
    const { data, error } = await supabase
      .from("profile_experience")
      .insert({ user_id: session.user.id, ...input, sort_order: experience.length })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    setExperience((prev) => [...prev, data as ExperienceEntry]);
  }

  async function handleDeleteExperience(id: number) {
    const { error } = await supabase.from("profile_experience").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setExperience((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleAddProject(input: ProjectInput) {
    if (!session) return;
    const { data, error } = await supabase
      .from("profile_projects")
      .insert({ user_id: session.user.id, ...input, sort_order: projects.length })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    setProjects((prev) => [...prev, data as ProjectEntry]);
  }

  async function handleDeleteProject(id: number) {
    const { error } = await supabase.from("profile_projects").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleAddSkill(category: string, skill: string) {
    if (!session) return;
    const sameCategory = skills.filter((s) => s.category === category).length;
    const { data, error } = await supabase
      .from("profile_skills")
      .insert({ user_id: session.user.id, category, skill, sort_order: sameCategory })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    setSkills((prev) => [...prev, data as SkillEntry]);
  }

  async function handleDeleteSkill(id: number) {
    const { error } = await supabase.from("profile_skills").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setSkills((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSaveCoverLetter(text: string) {
    if (!session) return;
    if (coverLetterId) {
      const { error } = await supabase
        .from("cover_letters")
        .update({ edited_content: text, updated_at: new Date().toISOString() })
        .eq("id", coverLetterId);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await supabase
        .from("cover_letters")
        .insert({ user_id: session.user.id, job_id: null, edited_content: text })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (data) setCoverLetterId(data.id as number);
    }
    setCoverLetterText(text);
  }

  async function handleImportFromResume() {
    if (!session) return;
    const resumeText = resumeVersions.find((v) => v.is_default)?.resume_text ?? "";
    if (!resumeText.trim()) return;

    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch("/api/parse-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ resumeText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      // Only fills fields that are currently empty — never overwrites
      // something the user already typed themselves.
      const identityPatch: Partial<Profile> = {};
      if (!profile.full_name.trim() && data.full_name) identityPatch.full_name = data.full_name;
      if (!profile.location.trim() && data.location) identityPatch.location = data.location;
      if (!profile.phone.trim() && data.phone) identityPatch.phone = data.phone;
      if (!profile.linkedin_url.trim() && data.linkedin_url) identityPatch.linkedin_url = data.linkedin_url;
      if (!profile.professional_summary.trim() && data.professional_summary) {
        identityPatch.professional_summary = data.professional_summary;
      }
      if (Object.keys(identityPatch).length > 0) {
        await handleSaveProfile(identityPatch);
      }

      for (const edu of data.education ?? []) {
        await handleAddEducation({
          school: edu.school ?? "",
          degree: edu.degree ?? "",
          field: edu.field ?? "",
          start_date: edu.start_date ?? "",
          end_date: edu.end_date ?? "",
        });
      }

      for (const exp of data.experience ?? []) {
        await handleAddExperience({
          title: exp.title ?? "",
          company: exp.company ?? "",
          location: exp.location ?? "",
          start_date: exp.start_date ?? "",
          end_date: exp.end_date ?? "",
          bullets: Array.isArray(exp.bullets) ? exp.bullets : [],
        });
      }

      for (const proj of data.projects ?? []) {
        await handleAddProject({
          title: proj.title ?? "",
          description: proj.description ?? "",
          link: proj.link ?? "",
          bullets: Array.isArray(proj.bullets) ? proj.bullets : [],
        });
      }

      for (const group of data.skills ?? []) {
        for (const item of group.items ?? []) {
          await handleAddSkill(group.category ?? "Skills", item);
        }
      }

      logActivity(session.user.id, "profile", session.user.id, "profile_imported_from_resume", {});
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed — try again");
    } finally {
      setImporting(false);
    }
  }

  if (loadingSession) {
    return (
      <main className="container center-page">
        <div className="skeleton-spinner" aria-label="Loading" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="container center-page">
        <div>
          <div className="brand brand-centered" style={{ marginBottom: "1.5rem" }}>
            <Logomark size={40} />
            <h1>jobfit</h1>
            <p className="tagline">Fewer, better, real job matches.</p>
          </div>
          <SignIn />
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <AppHeader session={session} active="/profile" />

      {loadingData ? (
        <div className="card">
          <div className="skeleton-line" style={{ width: "40%" }} />
          <div className="skeleton-line" style={{ width: "70%", marginTop: "0.5rem" }} />
        </div>
      ) : (
        <ProfileView
          profile={profile}
          email={session.user.email ?? ""}
          education={education}
          experience={experience}
          projects={projects}
          skills={skills}
          resumeVersions={resumeVersions}
          coverLetterText={coverLetterText}
          importing={importing}
          importError={importError}
          onSaveProfile={handleSaveProfile}
          onImportFromResume={handleImportFromResume}
          onAddEducation={handleAddEducation}
          onDeleteEducation={handleDeleteEducation}
          onAddExperience={handleAddExperience}
          onDeleteExperience={handleDeleteExperience}
          onAddProject={handleAddProject}
          onDeleteProject={handleDeleteProject}
          onAddSkill={handleAddSkill}
          onDeleteSkill={handleDeleteSkill}
          onSaveCoverLetter={handleSaveCoverLetter}
        />
      )}
    </main>
  );
}

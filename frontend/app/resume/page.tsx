"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { EducationEntry, ExperienceEntry, FormatPrefs, Profile, ResumeVersion, SkillEntry } from "@/lib/types";
import { logActivity } from "@/lib/logActivity";
import { SignIn } from "@/components/SignIn";
import { AppHeader } from "@/components/AppHeader";
import { AssistantPanel } from "@/components/AssistantPanel";
import { useAssistantOpen } from "@/lib/useAssistantOpen";
import { ResumeCenter } from "@/components/ResumeCenter";
import { ResumeEditor } from "@/components/ResumeEditor";
import { Logomark, SparkleIcon } from "@/components/icons";

// Per-user (auth session, resume versions) — never static.
export const dynamic = "force-dynamic";

const DEFAULT_PROFILE: Profile = {
  full_name: "",
  open_to_work: true,
  location: "",
  phone: "",
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

export default function Resume() {
  const { session, loadingSession } = useSession();
  const [assistantOpen, setAssistantOpen] = useAssistantOpen();
  const [resumeVersions, setResumeVersions] = useState<ResumeVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [education, setEducation] = useState<EducationEntry[]>([]);
  const [experience, setExperience] = useState<ExperienceEntry[]>([]);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [coverLetterId, setCoverLetterId] = useState<number | null>(null);
  const [coverLetterText, setCoverLetterText] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!session) return;
    setLoadingData(true);

    Promise.all([
      supabase.from("resumes").select("resume_text").eq("user_id", session.user.id).maybeSingle(),
      supabase.from("resume_versions").select("*").order("created_at", { ascending: false }),
      supabase.from("profile").select("*").maybeSingle(),
      supabase.from("profile_education").select("*").order("sort_order"),
      supabase.from("profile_experience").select("*").order("sort_order"),
      supabase.from("profile_skills").select("*").order("category").order("sort_order"),
      supabase.from("cover_letters").select("id, edited_content").is("job_id", null).maybeSingle(),
    ]).then(async ([legacyResumeRes, versionsRes, profileRes, eduRes, expRes, skillsRes, letterRes]) => {
      let versions = (versionsRes.data as ResumeVersion[]) ?? [];

      // One-time backfill: users from before Phase 5 have their resume only
      // in the legacy `resumes` table. Give them a matching default version
      // instead of starting the Resume Center empty.
      const legacyText = legacyResumeRes.data?.resume_text ?? "";
      if (versions.length === 0 && legacyText.trim()) {
        const { data: migrated } = await supabase
          .from("resume_versions")
          .insert({ user_id: session.user.id, title: "My resume", resume_text: legacyText, is_default: true })
          .select("*")
          .single();
        if (migrated) versions = [migrated as ResumeVersion];
      }

      setResumeVersions(versions);
      setSelectedVersionId((versions.find((v) => v.is_default) ?? versions[0])?.id ?? null);
      setProfile((profileRes.data as Profile) ?? DEFAULT_PROFILE);
      setEducation((eduRes.data as EducationEntry[]) ?? []);
      setExperience((expRes.data as ExperienceEntry[]) ?? []);
      setSkills((skillsRes.data as SkillEntry[]) ?? []);
      setCoverLetterId((letterRes.data?.id as number) ?? null);
      setCoverLetterText(letterRes.data?.edited_content ?? "");
      setLoadingData(false);
    });
  }, [session]);

  // The legacy `resumes` table is what the Python matcher still reads —
  // keep it mirrored to whichever version is default so scoring never
  // requires touching the ingestion pipeline (see README / Phase 1 decision).
  async function syncLegacyResume(text: string) {
    if (!session) return;
    await supabase
      .from("resumes")
      .upsert({ user_id: session.user.id, resume_text: text, updated_at: new Date().toISOString() });
  }

  async function handleAddResumeVersion(title: string, text: string) {
    if (!session) return;
    const makeDefault = resumeVersions.length === 0;
    const { data, error } = await supabase
      .from("resume_versions")
      .insert({ user_id: session.user.id, title, resume_text: text, is_default: makeDefault })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const inserted = data as ResumeVersion;
    setResumeVersions((prev) => [inserted, ...prev]);
    if (makeDefault) await syncLegacyResume(text);
    logActivity(session.user.id, "resume", String(inserted.id), "resume_version_added", { title });
  }

  async function handleSetDefaultResumeVersion(id: number) {
    if (!session) return;
    const target = resumeVersions.find((v) => v.id === id);
    if (!target || target.is_default) return;

    await supabase.from("resume_versions").update({ is_default: false }).eq("user_id", session.user.id).eq("is_default", true);
    await supabase.from("resume_versions").update({ is_default: true }).eq("id", id);

    setResumeVersions((prev) => prev.map((v) => ({ ...v, is_default: v.id === id })));
    await syncLegacyResume(target.resume_text);
    logActivity(session.user.id, "resume", String(id), "resume_version_set_default", { title: target.title });
  }

  async function handleUpdateResumeVersion(id: number, text: string) {
    if (!session) return;
    const target = resumeVersions.find((v) => v.id === id);
    await supabase.from("resume_versions").update({ resume_text: text }).eq("id", id);
    setResumeVersions((prev) => prev.map((v) => (v.id === id ? { ...v, resume_text: text } : v)));
    if (target?.is_default) await syncLegacyResume(text);
    logActivity(session.user.id, "resume", String(id), "resume_updated", {});
  }

  async function handleDeleteResumeVersion(id: number) {
    if (!session) return;
    const target = resumeVersions.find((v) => v.id === id);
    if (!target || target.is_default || resumeVersions.length <= 1) return;

    await supabase.from("resume_versions").delete().eq("id", id);
    setResumeVersions((prev) => prev.filter((v) => v.id !== id));
    logActivity(session.user.id, "resume", String(id), "resume_version_deleted", { title: target.title });
  }

  async function handleAnalyzeResumeVersion(id: number, atsScore: number, keywords: string[]) {
    if (!session) return;
    await supabase.from("resume_versions").update({ ats_score: atsScore, keywords }).eq("id", id);
    setResumeVersions((prev) => prev.map((v) => (v.id === id ? { ...v, ats_score: atsScore, keywords } : v)));
    const target = resumeVersions.find((v) => v.id === id);
    logActivity(session.user.id, "resume", String(id), "resume_analyzed", { title: target?.title, atsScore });
  }

  async function handleSaveFormatPrefs(id: number, prefs: Partial<FormatPrefs>) {
    await supabase.from("resume_versions").update({ format_prefs: prefs }).eq("id", id);
    setResumeVersions((prev) => prev.map((v) => (v.id === id ? { ...v, format_prefs: prefs } : v)));
  }

  async function handleSaveCoverLetter(text: string) {
    if (!session) return;
    setCoverLetterText(text);
    if (coverLetterId) {
      await supabase.from("cover_letters").update({ edited_content: text, updated_at: new Date().toISOString() }).eq("id", coverLetterId);
    } else {
      const { data } = await supabase
        .from("cover_letters")
        .insert({ user_id: session.user.id, job_id: null, edited_content: text })
        .select("id")
        .single();
      if (data) setCoverLetterId(data.id as number);
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

  const content = loadingData ? (
    <div className="card">
      <div className="skeleton-line" style={{ width: "40%" }} />
      <div className="skeleton-line" style={{ width: "70%", marginTop: "0.5rem" }} />
    </div>
  ) : (
    <>
      <ResumeEditor
        versions={resumeVersions}
        selectedId={selectedVersionId}
        onSelect={setSelectedVersionId}
        onAddVersion={() => handleAddResumeVersion("Untitled resume", "")}
        onSetDefault={handleSetDefaultResumeVersion}
        profile={profile}
        education={education}
        experience={experience}
        skills={skills}
        coverLetterText={coverLetterText}
        onSavePrefs={handleSaveFormatPrefs}
        onSaveCoverLetter={handleSaveCoverLetter}
      />
      <ResumeCenter
        accessToken={session.access_token}
        versions={resumeVersions}
        onAdd={handleAddResumeVersion}
        onSetDefault={handleSetDefaultResumeVersion}
        onUpdate={handleUpdateResumeVersion}
        onDelete={handleDeleteResumeVersion}
        onAnalyzed={handleAnalyzeResumeVersion}
      />
    </>
  );

  return (
    <main className={assistantOpen ? "container-wide" : "container"}>
      <AppHeader session={session} active="/resume" />

      {assistantOpen ? (
        <div className="assistant-layout">
          <AssistantPanel session={session} onClose={() => setAssistantOpen(false)} />
          <div className="assistant-layout-main">{content}</div>
        </div>
      ) : (
        <>
          <button type="button" className="ghost icon-btn assistant-reopen" onClick={() => setAssistantOpen(true)}>
            <SparkleIcon size={14} /> Assistant
          </button>
          {content}
        </>
      )}
    </main>
  );
}

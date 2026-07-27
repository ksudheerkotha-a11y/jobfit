"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { ResumeVersion } from "@/lib/types";
import { logActivity } from "@/lib/logActivity";
import { SignIn } from "@/components/SignIn";
import { AppHeader } from "@/components/AppHeader";
import { ResumeCenter } from "@/components/ResumeCenter";
import { Logomark } from "@/components/icons";

// Per-user (auth session, resume versions) — never static.
export const dynamic = "force-dynamic";

export default function Resume() {
  const { session, loadingSession } = useSession();
  const [resumeVersions, setResumeVersions] = useState<ResumeVersion[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!session) return;
    setLoadingData(true);

    Promise.all([
      supabase.from("resumes").select("resume_text").eq("user_id", session.user.id).maybeSingle(),
      supabase.from("resume_versions").select("*").order("created_at", { ascending: false }),
    ]).then(async ([legacyResumeRes, versionsRes]) => {
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
      <AppHeader session={session} active="/resume" />

      {loadingData ? (
        <div className="card">
          <div className="skeleton-line" style={{ width: "40%" }} />
          <div className="skeleton-line" style={{ width: "70%", marginTop: "0.5rem" }} />
        </div>
      ) : (
        <ResumeCenter
          accessToken={session.access_token}
          versions={resumeVersions}
          onAdd={handleAddResumeVersion}
          onSetDefault={handleSetDefaultResumeVersion}
          onUpdate={handleUpdateResumeVersion}
          onDelete={handleDeleteResumeVersion}
          onAnalyzed={handleAnalyzeResumeVersion}
        />
      )}
    </main>
  );
}

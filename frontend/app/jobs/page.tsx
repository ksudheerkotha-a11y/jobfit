"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { JobRow, ResumeVersion, SavedJob } from "@/lib/types";
import { SignIn } from "@/components/SignIn";
import { AppHeader } from "@/components/AppHeader";
import { AssistantPanel } from "@/components/AssistantPanel";
import { useAssistantOpen } from "@/lib/useAssistantOpen";
import { JobSearch } from "@/components/JobSearch";
import { BrowseMatches } from "@/components/BrowseMatches";
import { SavedJobs } from "@/components/SavedJobs";
import { Logomark, SparkleIcon } from "@/components/icons";

// Per-user (auth session, saved jobs, resume) — never static.
export const dynamic = "force-dynamic";

const SAVED_JOBS_SELECT =
  "id, job_id, created_at, jobs(id, title, company, location, description, apply_url, posted_at)";

export default function Jobs() {
  const { session, loadingSession } = useSession();
  const [assistantOpen, setAssistantOpen] = useAssistantOpen();
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [resumeVersions, setResumeVersions] = useState<ResumeVersion[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!session) return;
    setLoadingData(true);

    Promise.all([
      supabase.from("saved_jobs").select(SAVED_JOBS_SELECT).order("created_at", { ascending: false }),
      supabase.from("resume_versions").select("*"),
    ]).then(([savedJobsRes, versionsRes]) => {
      setSavedJobs((savedJobsRes.data as unknown as SavedJob[]) ?? []);
      setResumeVersions((versionsRes.data as ResumeVersion[]) ?? []);
      setLoadingData(false);
    });
  }, [session]);

  const resumeText = resumeVersions.find((v) => v.is_default)?.resume_text ?? "";
  const savedJobIds = new Set(savedJobs.map((s) => s.job_id));

  function handleSaveToggle(jobId: string, job: JobRow, saved: boolean) {
    if (saved) {
      setSavedJobs((prev) => [{ id: Date.now(), job_id: jobId, created_at: new Date().toISOString(), jobs: job }, ...prev]);
    } else {
      setSavedJobs((prev) => prev.filter((s) => s.job_id !== jobId));
    }
  }

  function handleUnsave(jobId: string) {
    setSavedJobs((prev) => prev.filter((s) => s.job_id !== jobId));
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
      <BrowseMatches resumeText={resumeText} accessToken={session.access_token} />
      <JobSearch userId={session.user.id} savedJobIds={savedJobIds} onSaveToggle={handleSaveToggle} />
      <SavedJobs userId={session.user.id} savedJobs={savedJobs} onUnsave={handleUnsave} />
    </>
  );

  return (
    <main className={assistantOpen ? "container-wide" : "container"}>
      <AppHeader session={session} active="/jobs" />

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

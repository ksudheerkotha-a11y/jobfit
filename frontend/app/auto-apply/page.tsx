"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { AUTO_APPLY_QUEUE_SELECT, AutoApplyQueueItem, AutoApplySettings, ResumeVersion } from "@/lib/types";
import { logActivity } from "@/lib/logActivity";
import { SignIn } from "@/components/SignIn";
import { AppHeader } from "@/components/AppHeader";
import { AssistantPanel } from "@/components/AssistantPanel";
import { useAssistantOpen } from "@/lib/useAssistantOpen";
import { AutoApplyView } from "@/components/AutoApplyView";
import { Logomark, SparkleIcon } from "@/components/icons";

// Per-user (auth session, settings, queue) — never static.
export const dynamic = "force-dynamic";

const DEFAULT_SETTINGS: AutoApplySettings = {
  enabled: false,
  min_fit_score: 0.85,
  daily_cap: 5,
  resume_version_id: null,
  updated_at: new Date().toISOString(),
};

export default function AutoApply() {
  const { session, loadingSession } = useSession();
  const [assistantOpen, setAssistantOpen] = useAssistantOpen();
  const [settings, setSettings] = useState<AutoApplySettings>(DEFAULT_SETTINGS);
  const [resumeVersions, setResumeVersions] = useState<ResumeVersion[]>([]);
  const [queueItems, setQueueItems] = useState<AutoApplyQueueItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  // A ref (not state) so it's checked/set synchronously — the auto-trigger
  // effect and the manual "Run now" button both call runNow(), and without
  // this guard they could race: both read the daily cap, both see room,
  // both insert, and the cap is silently exceeded.
  const runningRef = useRef(false);

  const runNow = useCallback(async (): Promise<{ created: number; reason?: string; error?: string }> => {
    if (!session) return { created: 0 };
    if (runningRef.current) return { created: 0, reason: "already_running" };
    runningRef.current = true;
    try {
      const res = await fetch("/api/auto-apply/run", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) return { created: 0, error: data.error || `Request failed (${res.status})` };
      return data;
    } catch {
      return { created: 0, error: "Couldn't reach the server — check your connection and try again." };
    } finally {
      runningRef.current = false;
    }
  }, [session]);

  function describeRunResult(result: { created: number; reason?: string; error?: string }): string {
    if (result.error) return `Run failed: ${result.error}`;
    if (result.created > 0) return `Queued ${result.created} new draft${result.created === 1 ? "" : "s"}.`;
    if (result.reason === "already_running") return "A check is already in progress — hang tight.";
    if (result.reason === "no_resume") return "No resume text found — set a resume in the dropdown above or add one in the Resume Center.";
    if (result.reason === "cap_reached") return "Today's daily cap is already used up — raise it above or check back tomorrow.";
    if (result.reason === "disabled") return "Auto Apply is off — enable it above first.";
    return "No new matches met your quality bar right now — try lowering it, or check back after the next match run.";
  }

  async function refetchQueue() {
    const { data } = await supabase
      .from("auto_apply_queue")
      .select(AUTO_APPLY_QUEUE_SELECT)
      .order("created_at", { ascending: false });
    setQueueItems((data as unknown as AutoApplyQueueItem[]) ?? []);
  }

  useEffect(() => {
    if (!session) return;
    setLoadingData(true);

    Promise.all([
      supabase.from("auto_apply_settings").select("*").maybeSingle(),
      supabase.from("resume_versions").select("*"),
      supabase.from("auto_apply_queue").select(AUTO_APPLY_QUEUE_SELECT).order("created_at", { ascending: false }),
    ]).then(([settingsRes, versionsRes, queueRes]) => {
      setSettings((settingsRes.data as AutoApplySettings) ?? DEFAULT_SETTINGS);
      setResumeVersions((versionsRes.data as ResumeVersion[]) ?? []);
      setQueueItems((queueRes.data as unknown as AutoApplyQueueItem[]) ?? []);
      setLoadingData(false);

      // Check for newly-qualifying matches on every visit. Cheap when
      // there's nothing new to draft — the route only spends a Groq call
      // per genuinely new candidate. Silent on this automatic check (no
      // toast) — errors still surface via "Run now", which uses the same
      // path.
      if (settingsRes.data?.enabled && session) {
        runNow().then(() => refetchQueue());
      }
    });
  }, [session, runNow]);

  async function handleSaveSettings(next: Partial<AutoApplySettings>) {
    if (!session) return;
    const merged = { ...settings, ...next };
    const { error } = await supabase.from("auto_apply_settings").upsert({ user_id: session.user.id, ...merged });
    // Only reflect the change locally once the write actually succeeded —
    // otherwise a failed save (RLS, network, whatever) would still show
    // "Enabled" in the UI while the database, which /api/auto-apply/run
    // reads from directly, keeps the old value.
    if (error) throw new Error(error.message);
    setSettings(merged);
    // Clears any leftover "Run now" status message — otherwise a stale
    // "Auto Apply is off" (or any other prior reason) keeps showing after
    // the settings that caused it have already changed.
    setRunResult(null);
  }

  async function handleRunNow() {
    if (!session) return;
    setRunning(true);
    setRunResult(null);
    const result = await runNow();
    setRunResult(describeRunResult(result));
    await refetchQueue();
    setRunning(false);
  }

  async function handleMarkApplied(item: AutoApplyQueueItem) {
    if (!session) return;
    const { error: queueError } = await supabase.from("auto_apply_queue").update({ status: "applied" }).eq("id", item.id);
    if (queueError) throw new Error(queueError.message);

    const { error: matchError } = await supabase
      .from("matches")
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("job_id", item.job_id)
      .eq("user_id", session.user.id);
    if (matchError) throw new Error(matchError.message);

    setQueueItems((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "applied" } : q)));
    logActivity(session.user.id, "application", item.job_id, "status_changed", {
      from: "new",
      to: "applied",
      company: item.jobs?.company,
      title: item.jobs?.title,
    });
  }

  async function handleDismiss(item: AutoApplyQueueItem) {
    if (!session) return;
    const { error } = await supabase.from("auto_apply_queue").update({ status: "dismissed" }).eq("id", item.id);
    if (error) throw new Error(error.message);
    setQueueItems((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "dismissed" } : q)));
    logActivity(session.user.id, "application", item.job_id, "auto_apply_queue_dismissed", {
      company: item.jobs?.company,
      title: item.jobs?.title,
    });
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
    <AutoApplyView
      settings={settings}
      resumeVersions={resumeVersions}
      queueItems={queueItems}
      running={running}
      runResult={runResult}
      onSaveSettings={handleSaveSettings}
      onRunNow={handleRunNow}
      onMarkApplied={handleMarkApplied}
      onDismiss={handleDismiss}
    />
  );

  return (
    <main className={assistantOpen ? "container-wide" : "container"}>
      <AppHeader session={session} active="/auto-apply" />

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

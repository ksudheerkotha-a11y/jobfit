"use client";

import { useEffect, useState } from "react";
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

      // Fire-and-forget: check for newly-qualifying matches on every visit.
      // Cheap when there's nothing new to draft — the route only spends a
      // Groq call per genuinely new candidate.
      if (settingsRes.data?.enabled && session) {
        fetch("/api/auto-apply/run", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then(() => refetchQueue())
          .catch(() => {});
      }
    });
  }, [session]);

  async function handleSaveSettings(next: Partial<AutoApplySettings>) {
    if (!session) return;
    const merged = { ...settings, ...next };
    await supabase.from("auto_apply_settings").upsert({ user_id: session.user.id, ...merged });
    setSettings(merged);
  }

  async function handleRunNow() {
    if (!session) return;
    setRunning(true);
    await fetch("/api/auto-apply/run", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).catch(() => {});
    await refetchQueue();
    setRunning(false);
  }

  async function handleMarkApplied(item: AutoApplyQueueItem) {
    if (!session) return;
    await supabase.from("auto_apply_queue").update({ status: "applied" }).eq("id", item.id);
    setQueueItems((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "applied" } : q)));

    await supabase
      .from("matches")
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("job_id", item.job_id)
      .eq("user_id", session.user.id);

    logActivity(session.user.id, "application", item.job_id, "status_changed", {
      from: "new",
      to: "applied",
      company: item.jobs?.company,
      title: item.jobs?.title,
    });
  }

  async function handleDismiss(item: AutoApplyQueueItem) {
    if (!session) return;
    await supabase.from("auto_apply_queue").update({ status: "dismissed" }).eq("id", item.id);
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

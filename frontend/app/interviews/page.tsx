"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { Interview, MATCHES_SELECT, MatchedJobRow } from "@/lib/types";
import { logActivity } from "@/lib/logActivity";
import { SignIn } from "@/components/SignIn";
import { AppHeader } from "@/components/AppHeader";
import { InterviewHub, InterviewInput } from "@/components/InterviewHub";
import { Logomark } from "@/components/icons";

// Per-user (auth session, interviews, matches) — never static, and avoids
// the Supabase client being constructed at build time.
export const dynamic = "force-dynamic";

export default function Interviews() {
  const { session, loadingSession } = useSession();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [matches, setMatches] = useState<MatchedJobRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!session) return;
    setLoadingData(true);

    Promise.all([
      supabase.from("interviews").select("*").order("scheduled_at", { ascending: true }),
      supabase.from("matches").select(MATCHES_SELECT).order("fit_score", { ascending: false }),
    ]).then(([interviewsRes, matchesRes]) => {
      setInterviews((interviewsRes.data as Interview[]) ?? []);
      setMatches((matchesRes.data as unknown as MatchedJobRow[]) ?? []);
      setLoadingData(false);
    });
  }, [session]);

  async function handleAdd(input: InterviewInput) {
    if (!session) return;
    const { data, error } = await supabase
      .from("interviews")
      .insert({ user_id: session.user.id, ...input })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    setInterviews((prev) => [...prev, data as Interview]);
    logActivity(session.user.id, "interview", String((data as Interview).id), "interview_scheduled", {
      company: input.company,
      stage: input.stage,
    });
  }

  async function handleUpdate(id: number, input: InterviewInput) {
    if (!session) return;
    await supabase.from("interviews").update(input).eq("id", id);
    setInterviews((prev) => prev.map((i) => (i.id === id ? { ...i, ...input } : i)));
    logActivity(session.user.id, "interview", String(id), "interview_updated", { company: input.company });
  }

  async function handleDelete(id: number) {
    if (!session) return;
    const target = interviews.find((i) => i.id === id);
    await supabase.from("interviews").delete().eq("id", id);
    setInterviews((prev) => prev.filter((i) => i.id !== id));
    logActivity(session.user.id, "interview", String(id), "interview_deleted", { company: target?.company });
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
      <AppHeader session={session} active="/interviews" />

      {loadingData ? (
        <div className="card">
          <div className="skeleton-line" style={{ width: "40%" }} />
          <div className="skeleton-line" style={{ width: "70%", marginTop: "0.5rem" }} />
        </div>
      ) : (
        <InterviewHub interviews={interviews} matches={matches} onAdd={handleAdd} onUpdate={handleUpdate} onDelete={handleDelete} />
      )}
    </main>
  );
}

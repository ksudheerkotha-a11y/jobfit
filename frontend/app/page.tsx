"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { MatchedJobRow } from "@/lib/types";
import { SignIn } from "@/components/SignIn";
import { ResumeForm } from "@/components/ResumeForm";
import { MatchesTable } from "@/components/MatchesTable";

// This page is inherently per-user (auth session, resume, matches) — never
// static. Also avoids the Supabase client being constructed at build time,
// when real env vars aren't necessarily present yet.
export const dynamic = "force-dynamic";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [resumeText, setResumeText] = useState("");
  const [matches, setMatches] = useState<MatchedJobRow[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;

    setLoadingData(true);

    Promise.all([
      supabase
        .from("resumes")
        .select("resume_text")
        .eq("user_id", session.user.id)
        .maybeSingle(),
      supabase
        .from("matches")
        .select("fit_score, missing_skills, reasons, status, jobs(title, company, location, apply_url, posted_at)")
        .order("fit_score", { ascending: false }),
    ]).then(([resumeRes, matchesRes]) => {
      setResumeText(resumeRes.data?.resume_text ?? "");
      setMatches((matchesRes.data as unknown as MatchedJobRow[]) ?? []);
      setLoadingData(false);
    });
  }, [session]);

  if (loadingSession) {
    return <main className="container">Loading...</main>;
  }

  if (!session) {
    return (
      <main className="container">
        <h1>jobfit</h1>
        <p className="hint">Sign in to see your shortlist.</p>
        <SignIn />
      </main>
    );
  }

  return (
    <main className="container">
      <header>
        <h1>jobfit</h1>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <ResumeForm userId={session.user.id} initialText={resumeText} />

      <section>
        <h2>Your shortlist</h2>
        {loadingData ? <p>Loading matches...</p> : <MatchesTable matches={matches} />}
      </section>
    </main>
  );
}

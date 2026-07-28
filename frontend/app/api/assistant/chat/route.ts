import { NextRequest, NextResponse } from "next/server";
import { callGroq, verifySession } from "@/lib/groqServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Runs server-side only. Grounds every answer in a compact summary of the
// caller's own real data (built here with the service-role client, scoped
// to whichever user the session verifies as) — never the user-supplied
// message alone, so the assistant can't be steered into inventing job
// titles, companies, or numbers that don't exist. Same primary/fallback
// Groq key pattern as every other AI route in the app.
export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are the jobfit assistant, embedded in a user's job-search dashboard.

Answer using ONLY the real data summarized below — never invent job titles, companies, dates, or numbers that aren't in it. If you don't have enough data to answer something, say so plainly instead of guessing.

jobfit never submits job applications automatically. If the user asks you to "apply" for them, explain that: the Auto Apply page can pre-draft a cover letter and tailored resume for their best new matches so they're ready to review, but they always click the real Apply link and submit it themselves — there is no automated submission anywhere in the app. Point them at their top matches or the Auto Apply review queue instead of pretending to apply on their behalf.

Keep replies short — 2-5 sentences, conversational, specific to their real numbers below. No markdown headers or bullet lists unless genuinely useful for a short list of items.

USER'S REAL DATA:
{context}`;

type MatchRow = {
  job_id: string;
  fit_score: number | null;
  status: string;
  applied_at: string | null;
  missing_skills: string[] | null;
  jobs: { title: string; company: string } | null;
};

function buildContext(
  matches: MatchRow[],
  resumeStatus: { hasDefault: boolean; atsScore: number | null },
  upcomingInterviews: { company: string; role: string; scheduled_at: string }[]
): string {
  const active = matches.filter((m) => m.status !== "dismissed");
  const byStatus: Record<string, number> = {};
  for (const m of active) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;

  const avgFit =
    active.length > 0 ? Math.round((active.reduce((s, m) => s + (m.fit_score ?? 0), 0) / active.length) * 100) : null;

  const top = [...active].sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))[0];

  const followUpDue = active.filter(
    (m) => m.status === "applied" && m.applied_at && Date.now() - new Date(m.applied_at).getTime() >= 7 * 86400000
  ).length;

  const skillCounts: Record<string, number> = {};
  for (const m of active) {
    for (const s of m.missing_skills ?? []) skillCounts[s] = (skillCounts[s] ?? 0) + 1;
  }
  const topMissingSkills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([skill, count]) => `${skill} (missing from ${count} matches)`);

  const lines = [
    `Active matches: ${active.length} (${Object.entries(byStatus).map(([s, n]) => `${n} ${s}`).join(", ") || "none"})`,
    avgFit !== null ? `Average fit score: ${avgFit}%` : "Average fit score: no active matches yet",
    top ? `Top match: ${Math.round((top.fit_score ?? 0) * 100)}% fit — ${top.jobs?.title ?? "?"} at ${top.jobs?.company ?? "?"}, status "${top.status}"` : "No matches yet",
    `Applications waiting 7+ days for a follow-up: ${followUpDue}`,
    topMissingSkills.length > 0 ? `Most common missing skills across matches: ${topMissingSkills.join(", ")}` : "No recurring missing skills detected",
    resumeStatus.hasDefault
      ? `Default resume on file${resumeStatus.atsScore !== null ? `, last ATS score ${resumeStatus.atsScore}` : ", not yet analyzed for ATS score"}`
      : "No default resume saved yet — matching and AI features need one",
    upcomingInterviews.length > 0
      ? `Upcoming interviews: ${upcomingInterviews
          .map((iv) => `${iv.role} at ${iv.company} on ${new Date(iv.scheduled_at).toLocaleDateString("en-US")}`)
          .join("; ")}`
      : "No upcoming interviews scheduled",
  ];

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const session = await verifySession(req);
  if ("error" in session) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.message?.trim()) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  const userId = session.userId;
  const admin = supabaseAdmin();

  const [matchesRes, resumeRes, interviewsRes] = await Promise.all([
    admin
      .from("matches")
      .select("job_id, fit_score, status, applied_at, missing_skills, jobs(title, company)")
      .eq("user_id", userId),
    admin.from("resume_versions").select("ats_score").eq("user_id", userId).eq("is_default", true).maybeSingle(),
    admin
      .from("interviews")
      .select("company, role, scheduled_at")
      .eq("user_id", userId)
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(3),
  ]);

  const context = buildContext(
    (matchesRes.data ?? []) as unknown as MatchRow[],
    { hasDefault: !!resumeRes.data, atsScore: resumeRes.data?.ats_score ?? null },
    (interviewsRes.data ?? []) as { company: string; role: string; scheduled_at: string }[]
  );

  const prompt = `${SYSTEM_PROMPT.replace("{context}", context)}\n\nUser: ${body.message.trim()}`;

  const result = await callGroq(prompt, 400);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ reply: result.text });
}

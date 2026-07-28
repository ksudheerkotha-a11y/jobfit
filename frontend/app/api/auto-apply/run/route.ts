import { NextRequest, NextResponse } from "next/server";
import { callGroq, verifySession } from "@/lib/groqServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Runs server-side only. auto_apply_queue is system-written by design (see
// supabase_migration_004 — RLS has no insert policy for authenticated
// users, only select/update), so drafting has to happen here with the
// service-role client. This NEVER submits anything — it only pre-generates
// the cover letter + tailored resume for matches at or above the user's
// quality bar, using the exact same Groq calls the manual "Cover letter" /
// "Tailor resume" buttons already make. The user still applies themselves
// via the job's real apply_url.
export const runtime = "nodejs";

const DRAFT_PROMPT = `You are helping a candidate draft a short, tailored cover letter for one specific job.

Candidate's resume:
{resume}

Job ({title} at {company}):
{jd}

Write a cover letter draft (250-350 words) that:
- Opens by naming the specific role and company, not a generic greeting.
- Draws on 2-3 concrete things from the resume that map directly onto this JD's requirements.
- Uses only facts present in the resume — never invent experience, dates, or skills that aren't there.
- Reads like a confident, specific human wrote it, not boilerplate ("I am excited to apply...").
- Ends with a brief, direct closing line.

Output only the letter text, no preamble, no markdown formatting, no subject line.`;

const TAILOR_PROMPT = `You are helping a candidate tailor their resume to one specific job posting.

Candidate's current resume:
{resume}

Job ({title} at {company}):
{jd}

Produce a tailored version of the resume's SUMMARY and SKILLS sections only —
not a full rewrite — that emphasizes what this specific JD is asking for,
using only experience and skills already present in the original resume.
Never invent experience, employers, dates, or skills that aren't there.

Output in this exact structure, plain text, no markdown:

TAILORED SUMMARY:
<2-3 sentences, rewritten to foreground the parts of their background this
JD cares most about>

SUGGESTED BULLET REWRITES:
<3-5 existing resume bullets rewritten to use this JD's own terminology
where the underlying fact is the same>

SKILLS TO LEAD WITH:
<comma-separated list of skills from the resume to put first/most visibly,
ranked by relevance to this JD>`;

function startOfTodayISO(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function POST(req: NextRequest) {
  const session = await verifySession(req);
  if ("error" in session) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const userId = session.userId;
  const admin = supabaseAdmin();

  const { data: settings } = await admin
    .from("auto_apply_settings")
    .select("enabled, min_fit_score, daily_cap, resume_version_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings || !settings.enabled) {
    return NextResponse.json({ created: 0, reason: "disabled" });
  }

  let resumeText = "";
  if (settings.resume_version_id) {
    const { data: version } = await admin
      .from("resume_versions")
      .select("resume_text")
      .eq("id", settings.resume_version_id)
      .maybeSingle();
    resumeText = version?.resume_text ?? "";
  }
  if (!resumeText.trim()) {
    const { data: fallback } = await admin
      .from("resume_versions")
      .select("resume_text")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();
    resumeText = fallback?.resume_text ?? "";
  }
  if (!resumeText.trim()) {
    return NextResponse.json({ created: 0, reason: "no_resume" });
  }

  const { count: queuedToday } = await admin
    .from("auto_apply_queue")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfTodayISO());

  const remaining = settings.daily_cap - (queuedToday ?? 0);
  if (remaining <= 0) {
    return NextResponse.json({ created: 0, reason: "cap_reached" });
  }

  const [matchesRes, existingRes] = await Promise.all([
    admin
      .from("matches")
      .select("job_id, fit_score, jobs(title, company, description)")
      .eq("user_id", userId)
      .eq("status", "new")
      .gte("fit_score", settings.min_fit_score)
      .order("fit_score", { ascending: false }),
    admin.from("auto_apply_queue").select("job_id").eq("user_id", userId),
  ]);

  const alreadyQueued = new Set((existingRes.data ?? []).map((r) => r.job_id));
  const candidates = ((matchesRes.data ?? []) as unknown as {
    job_id: string;
    fit_score: number;
    jobs: { title: string; company: string; description: string } | null;
  }[])
    .filter((m) => !alreadyQueued.has(m.job_id) && m.jobs)
    .slice(0, remaining);

  let created = 0;
  let draftFailures = 0;
  for (const m of candidates) {
    const jd = m.jobs!;
    const [coverLetter, tailored] = await Promise.all([
      callGroq(
        DRAFT_PROMPT.replace("{resume}", resumeText.trim())
          .replace("{title}", jd.title)
          .replace("{company}", jd.company)
          .replace("{jd}", jd.description.trim()),
        700
      ),
      callGroq(
        TAILOR_PROMPT.replace("{resume}", resumeText.trim())
          .replace("{title}", jd.title)
          .replace("{company}", jd.company)
          .replace("{jd}", jd.description.trim()),
        700
      ),
    ]);

    if ("error" in coverLetter || "error" in tailored) {
      draftFailures += 1;
      continue;
    }

    const { error } = await admin.from("auto_apply_queue").insert({
      user_id: userId,
      job_id: m.job_id,
      cover_letter_draft: coverLetter.text,
      tailored_resume_draft: tailored.text,
      status: "queued",
    });
    if (error) {
      draftFailures += 1;
    } else {
      created += 1;
    }
  }

  // Distinguishes "nothing qualified" (created: 0, no reason — a real,
  // non-error outcome) from "matches qualified but drafting them failed"
  // (created: 0 + error) so the client doesn't tell the user to lower their
  // quality bar when the real problem was a Groq/DB failure.
  if (created === 0 && draftFailures > 0) {
    return NextResponse.json({
      created: 0,
      error: "Couldn't generate drafts for the qualifying matches — try again shortly.",
    });
  }

  return NextResponse.json({ created });
}

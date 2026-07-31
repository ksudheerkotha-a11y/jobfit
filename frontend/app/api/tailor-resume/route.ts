import { NextRequest, NextResponse } from "next/server";
import { callGroq, verifySession } from "@/lib/groqServer";

export const runtime = "nodejs";

const TAILOR_PROMPT = `You are helping a candidate tailor their resume to one specific job posting.
Produce a COMPLETE, ready-to-submit resume — not suggestions, not a partial
rewrite of just one section. The candidate should be able to copy your
output and use it to apply for this job as-is.

Candidate's current resume:
{resume}

Job ({title} at {company}):
{jd}

Rewrite the entire resume so it's optimized for this specific job:
- Keep every employer, job title, date range, degree, and school EXACTLY as
  in the original — never invent, remove, or alter facts, dates, or names.
- Reorder and rephrase bullets to foreground the experience most relevant to
  this job, using the JD's own terminology where the underlying fact is the
  same (e.g. if the JD says "stakeholder management" and the original says
  "cross-functional collaboration" for the same work, prefer the JD's
  phrasing).
- Rewrite the summary (if the original has one) to lead with what this JD
  cares about most.
- Reorder the skills list so the most relevant skills to this JD come first.
- Never add a skill, tool, employer, or achievement that isn't already
  present in the original resume.
- Keep the same overall section structure and order as the original resume.

Output the finished resume as plain text only — no markdown, no commentary,
no headers like "TAILORED RESUME:" — just the resume itself, ready to copy
and use.`;

export async function POST(req: NextRequest) {
  const session = await verifySession(req);
  if ("error" in session) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  let body: { resumeText?: string; jobTitle?: string; company?: string; jobDescription?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { resumeText, jobTitle, company, jobDescription } = body;
  if (!resumeText?.trim() || !jobTitle?.trim() || !company?.trim() || !jobDescription?.trim()) {
    return NextResponse.json(
      { error: "Missing resumeText, jobTitle, company, or jobDescription" },
      { status: 400 }
    );
  }

  const prompt = TAILOR_PROMPT.replace("{resume}", resumeText.trim())
    .replace("{title}", jobTitle)
    .replace("{company}", company)
    .replace("{jd}", jobDescription.trim());

  const result = await callGroq(prompt, 3000);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ tailored: result.text });
}

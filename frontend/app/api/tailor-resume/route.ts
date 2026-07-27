import { NextRequest, NextResponse } from "next/server";
import { callGroq, verifySession } from "@/lib/groqServer";

export const runtime = "nodejs";

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
where the underlying fact is the same — e.g. if the JD says "stakeholder
management" and the resume says "cross-functional collaboration" for the
same kind of work, prefer the JD's phrasing. Each on its own line, prefixed
with "- ">

SKILLS TO LEAD WITH:
<comma-separated list of skills from the resume to put first/most visibly,
ranked by relevance to this JD>`;

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

  const result = await callGroq(prompt, 700);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ tailored: result.text });
}

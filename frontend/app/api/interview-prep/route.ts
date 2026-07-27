import { NextRequest, NextResponse } from "next/server";
import { callGroq, verifySession } from "@/lib/groqServer";

// Runs server-side only (Vercel serverless function) — GROQ_API_KEY never
// reaches the browser. Same auth/fallback-key pattern as the other Groq
// routes (draft-cover-letter, tailor-resume, referral-draft).
export const runtime = "nodejs";

const PREP_PROMPT = `You are helping a candidate prepare for a real interview.

Candidate's resume:
{resume}

Interview: {stage} for {role} at {company}.
{jd}

Using only experience and skills already present in the resume — never
invent anything — produce interview prep in this exact structure, plain
text, no markdown:

LIKELY QUESTIONS:
<5-7 questions this interview stage is likely to include, given the role
and stage. Each on its own line, prefixed with "- ">

TALKING POINTS:
<4-6 concrete things from the resume worth bringing up, each rewritten as
a specific example or story the candidate can tell. Each on its own line,
prefixed with "- ">

QUESTIONS TO ASK THEM:
<3-4 smart, specific questions the candidate can ask the interviewer.
Each on its own line, prefixed with "- ">`;

export async function POST(req: NextRequest) {
  const session = await verifySession(req);
  if ("error" in session) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  let body: { resumeText?: string; company?: string; role?: string; stage?: string; jobDescription?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { resumeText, company, role, stage, jobDescription } = body;
  if (!resumeText?.trim() || !company?.trim() || !role?.trim()) {
    return NextResponse.json({ error: "Missing resumeText, company, or role" }, { status: 400 });
  }

  const prompt = PREP_PROMPT.replace("{resume}", resumeText.trim())
    .replace("{stage}", stage || "interview")
    .replace("{role}", role)
    .replace("{company}", company)
    .replace("{jd}", jobDescription?.trim() ? `Job description:\n${jobDescription.trim()}` : "");

  const result = await callGroq(prompt, 900);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ prep: result.text });
}

import { NextRequest, NextResponse } from "next/server";
import { callGroq, verifySession } from "@/lib/groqServer";

// Runs server-side only (Vercel serverless function) — GROQ_API_KEY never
// reaches the browser. Same auth/fallback-key pattern as the other Groq
// routes (draft-cover-letter, tailor-resume, referral-draft).
export const runtime = "nodejs";

const FOLLOWUP_PROMPT = `You are helping a candidate write a brief, polite follow-up message about a job application.

Candidate's resume:
{resume}

Job ({title} at {company}):
{jd}

It has been about {days} days since they applied, with no response yet.

Write a short follow-up email (under 120 words) that:
- Restates interest in the specific role, briefly.
- References one concrete qualification from the resume that fits this JD.
- Politely asks for a status update — no pressure, no guilt-tripping.
- Reads like a real person wrote it, not a template.

Output only the email body, no subject line, no markdown.`;

export async function POST(req: NextRequest) {
  const session = await verifySession(req);
  if ("error" in session) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  let body: { resumeText?: string; jobTitle?: string; company?: string; jobDescription?: string; daysSinceApplied?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { resumeText, jobTitle, company, jobDescription, daysSinceApplied } = body;
  if (!resumeText?.trim() || !jobTitle?.trim() || !company?.trim() || !jobDescription?.trim()) {
    return NextResponse.json(
      { error: "Missing resumeText, jobTitle, company, or jobDescription" },
      { status: 400 }
    );
  }

  const prompt = FOLLOWUP_PROMPT.replace("{resume}", resumeText.trim())
    .replace("{title}", jobTitle)
    .replace("{company}", company)
    .replace("{jd}", jobDescription.trim())
    .replace("{days}", String(daysSinceApplied ?? 7));

  const result = await callGroq(prompt, 400);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ draft: result.text });
}

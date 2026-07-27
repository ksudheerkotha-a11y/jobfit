import { NextRequest, NextResponse } from "next/server";
import { callGroq, verifySession } from "@/lib/groqServer";

// Runs server-side only (Vercel serverless function) — GROQ_API_KEY never
// reaches the browser. Gated behind a valid Supabase session, same as
// draft-cover-letter / tailor-resume / referral-draft.
export const runtime = "nodejs";

const ANALYZE_PROMPT = `You are an ATS (applicant tracking system) resume reviewer.

Resume:
{resume}

Evaluate this resume as plain text the way an ATS parser and a recruiter
skimming it in 10 seconds would. Consider: clear section headers (summary,
experience, education, skills), consistent formatting, quantified
achievements (numbers, %, $), no walls of unbroken text, no missing
contact/role/date info, no jargon-only bullets with no concrete outcome.

Output in this exact structure, plain text, no markdown:

SCORE: <a single integer 0-100>

KEYWORDS: <comma-separated list of 8-15 concrete skills/technologies/role
keywords actually present in the resume, most prominent first>

SUGGESTIONS:
- <one specific, actionable improvement>
- <one specific, actionable improvement>
- <one specific, actionable improvement>`;

function parseAnalysis(text: string): { atsScore: number; keywords: string[]; suggestions: string[] } | null {
  const scoreMatch = text.match(/SCORE:\s*(\d{1,3})/i);
  const keywordsMatch = text.match(/KEYWORDS:\s*(.+)/i);
  const suggestionsMatch = text.match(/SUGGESTIONS:\s*([\s\S]*)/i);

  if (!scoreMatch) return null;

  const atsScore = Math.max(0, Math.min(100, parseInt(scoreMatch[1], 10)));
  const keywords = (keywordsMatch?.[1] ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const suggestions = (suggestionsMatch?.[1] ?? "")
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  return { atsScore, keywords, suggestions };
}

export async function POST(req: NextRequest) {
  const session = await verifySession(req);
  if ("error" in session) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  let body: { resumeText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { resumeText } = body;
  if (!resumeText?.trim()) {
    return NextResponse.json({ error: "Missing resumeText" }, { status: 400 });
  }

  const prompt = ANALYZE_PROMPT.replace("{resume}", resumeText.trim());

  const result = await callGroq(prompt, 500);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const parsed = parseAnalysis(result.text);
  if (!parsed) {
    return NextResponse.json({ error: "Model returned an unexpected format — try again" }, { status: 502 });
  }

  return NextResponse.json(parsed);
}

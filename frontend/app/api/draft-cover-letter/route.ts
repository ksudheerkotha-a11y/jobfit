import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Runs server-side only (Vercel serverless function) — GROQ_API_KEY never
// reaches the browser. Gated behind a valid Supabase session so the shared
// free-tier key can't be hit by anonymous requests.
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

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const { data: userData, error: authError } = await supabaseAdmin().auth.getUser(token);
  if (authError || !userData.user) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing GROQ_API_KEY (set it in Vercel project env vars)" },
      { status: 500 }
    );
  }

  const prompt = DRAFT_PROMPT.replace("{resume}", resumeText.trim())
    .replace("{title}", jobTitle)
    .replace("{company}", company)
    .replace("{jd}", jobDescription.trim());

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!groqRes.ok) {
    const text = await groqRes.text();
    return NextResponse.json({ error: `Groq API error: ${text}` }, { status: 502 });
  }

  const data = await groqRes.json();
  const draft: string = data.choices?.[0]?.message?.content ?? "";

  if (!draft.trim()) {
    return NextResponse.json({ error: "Model returned an empty draft" }, { status: 502 });
  }

  return NextResponse.json({ draft });
}

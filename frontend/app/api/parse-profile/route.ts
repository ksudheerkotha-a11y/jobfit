import { NextRequest, NextResponse } from "next/server";
import { callGroq, verifySession } from "@/lib/groqServer";

// Runs server-side only (Vercel serverless function) — GROQ_API_KEY never
// reaches the browser. Same auth pattern as every other Groq route. Powers
// the Profile page's "Import from resume" action: extracts structured
// education/experience/skills from the resume text the user already has
// in the Resume Center, so Profile doesn't start as a blank form. The
// result is a starting point the user edits from — never invents anything
// not actually present in the resume.
export const runtime = "nodejs";

const PARSE_PROMPT = `Extract structured profile data from this resume. Use only information
actually present in the text — never invent schools, employers, dates, or skills.

Resume:
{resume}

Respond with ONLY a single JSON object, no markdown fences, no prose before or after, in this exact shape:

{
  "professional_summary": "2-3 sentence summary, written in third person or neutral voice",
  "education": [
    { "school": "...", "degree": "...", "field": "...", "start_date": "2016", "end_date": "2020" }
  ],
  "experience": [
    {
      "title": "...", "company": "...", "location": "...",
      "start_date": "Jun 2022", "end_date": "Present",
      "bullets": ["...", "..."]
    }
  ],
  "skills": [
    { "category": "Frameworks & Libraries", "items": ["Next.js", "React"] },
    { "category": "Databases", "items": ["Postgres"] }
  ]
}

Group skills into whatever categories genuinely fit what's in the resume (e.g. "Soft Skills",
"Frameworks & Libraries", "Databases", "Tools & Software", "Languages", "Cloud & DevOps") — don't
force categories that don't apply. Use "Present" for end_date on a current role. Omit a section
entirely (empty array) rather than guessing if the resume doesn't have it.`;

type ParsedProfile = {
  professional_summary: string;
  education: { school: string; degree: string; field: string; start_date: string; end_date: string }[];
  experience: {
    title: string;
    company: string;
    location: string;
    start_date: string;
    end_date: string;
    bullets: string[];
  }[];
  skills: { category: string; items: string[] }[];
};

function parseJson(text: string): ParsedProfile | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const data = JSON.parse(cleaned);
    if (typeof data !== "object" || data === null) return null;
    return {
      professional_summary: typeof data.professional_summary === "string" ? data.professional_summary : "",
      education: Array.isArray(data.education) ? data.education : [],
      experience: Array.isArray(data.experience) ? data.experience : [],
      skills: Array.isArray(data.skills) ? data.skills : [],
    };
  } catch {
    return null;
  }
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

  if (!body.resumeText?.trim()) {
    return NextResponse.json({ error: "Missing resumeText" }, { status: 400 });
  }

  const prompt = PARSE_PROMPT.replace("{resume}", body.resumeText.trim());
  const result = await callGroq(prompt, 1400);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const parsed = parseJson(result.text);
  if (!parsed) {
    return NextResponse.json({ error: "Model returned an unexpected format — try again" }, { status: 502 });
  }

  return NextResponse.json(parsed);
}

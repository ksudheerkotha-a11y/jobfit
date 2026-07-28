import { NextRequest, NextResponse } from "next/server";
import { callGroq, verifySession } from "@/lib/groqServer";

// Runs server-side only (Vercel serverless function) — GROQ_API_KEY never
// reaches the browser. Same auth pattern as every other Groq route. Powers
// the Profile page's "Import from resume" action: extracts structured
// identity/education/experience/projects/skills from the resume text the
// user already has in the Resume Center, so Profile doesn't start as a
// blank form. The result is a starting point the user edits from — never
// invents anything not actually present in the resume, and bullets are
// extracted verbatim rather than summarized, since a shortened bullet is
// a worse resume than the original.
export const runtime = "nodejs";

const PARSE_PROMPT = `Extract structured profile data from this resume. Use only information
actually present in the text — never invent names, schools, employers, dates, or skills.

Resume:
{resume}

Respond with ONLY a single JSON object, no markdown fences, no prose before or after, in this exact shape:

{
  "full_name": "as written at the top of the resume, or empty string if not present",
  "location": "city, region as written, or empty string",
  "phone": "as written, or empty string",
  "linkedin_url": "linkedin.com/in/... as written, or empty string",
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
  "projects": [
    { "title": "...", "description": "one line", "link": "... or empty string", "bullets": ["...", "..."] }
  ],
  "skills": [
    { "category": "Frameworks & Libraries", "items": ["Next.js", "React"] },
    { "category": "Databases", "items": ["Postgres"] }
  ]
}

Critical: for every bullet under "experience" and "projects", copy the FULL original bullet
text verbatim — do not summarize, shorten, merge, or drop bullets. Include every bullet the
resume has for every role, even if that makes the output long. Group skills into whatever
categories genuinely fit what's in the resume (e.g. "Soft Skills", "Frameworks & Libraries",
"Databases", "Tools & Software", "Languages", "Cloud & DevOps") — don't force categories that
don't apply. Use "Present" for end_date on a current role. Omit a section entirely (empty
array) rather than guessing if the resume doesn't have it.`;

type ParsedProfile = {
  full_name: string;
  location: string;
  phone: string;
  linkedin_url: string;
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
  projects: { title: string; description: string; link: string; bullets: string[] }[];
  skills: { category: string; items: string[] }[];
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseJson(text: string): ParsedProfile | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const data = JSON.parse(cleaned);
    if (typeof data !== "object" || data === null) return null;
    return {
      full_name: str(data.full_name),
      location: str(data.location),
      phone: str(data.phone),
      linkedin_url: str(data.linkedin_url),
      professional_summary: str(data.professional_summary),
      education: Array.isArray(data.education) ? data.education : [],
      experience: Array.isArray(data.experience) ? data.experience : [],
      projects: Array.isArray(data.projects) ? data.projects : [],
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
  // Verbatim bullets across every role/project needs real headroom — a
  // detailed multi-role resume easily exceeds the old 1400-token budget
  // and would get silently truncated mid-JSON.
  const result = await callGroq(prompt, 3000);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const parsed = parseJson(result.text);
  if (!parsed) {
    return NextResponse.json({ error: "Model returned an unexpected format — try again" }, { status: 502 });
  }

  return NextResponse.json(parsed);
}

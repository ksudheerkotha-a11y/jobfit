import { NextRequest, NextResponse } from "next/server";
import { callGroq, verifySession } from "@/lib/groqServer";

export const runtime = "nodejs";

const REFERRAL_PROMPT = `You are helping a candidate write a short message asking a contact for a
referral to a specific job at their company.

Candidate's resume:
{resume}

Job ({title} at {company}):
{jd}

Contact: {contactName}, {contactContext}

Write a short, direct message (under 120 words) the candidate could send this
contact (e.g. over LinkedIn or email) that:
- Is warm but brief — respects that this is a favor being asked.
- Names the specific role and why the candidate is a fit, using 1-2 concrete
  things from the resume (never invent experience not present in it).
- Makes a clear, low-friction ask — a referral or a quick word to the hiring
  team, not "let's catch up."
- Matches the tone of a real message between people who know each other, not
  a form letter.

Output only the message text, no preamble, no subject line, no markdown.`;

export async function POST(req: NextRequest) {
  const session = await verifySession(req);
  if ("error" in session) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  let body: {
    resumeText?: string;
    jobTitle?: string;
    company?: string;
    jobDescription?: string;
    contactName?: string;
    contactContext?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { resumeText, jobTitle, company, jobDescription, contactName, contactContext } = body;
  if (!resumeText?.trim() || !jobTitle?.trim() || !company?.trim() || !jobDescription?.trim() || !contactName?.trim()) {
    return NextResponse.json(
      { error: "Missing resumeText, jobTitle, company, jobDescription, or contactName" },
      { status: 400 }
    );
  }

  const prompt = REFERRAL_PROMPT.replace("{resume}", resumeText.trim())
    .replace("{title}", jobTitle)
    .replace("{company}", company)
    .replace("{jd}", jobDescription.trim())
    .replace("{contactName}", contactName)
    .replace("{contactContext}", contactContext?.trim() || "a contact at the company");

  const result = await callGroq(prompt, 400);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ draft: result.text });
}

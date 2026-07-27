import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/groqServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Server-side so the (still fairly large) jobs table isn't shipped to the
// browser just to compute this — Vercel serverless function.
export const runtime = "nodejs";

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "with", "have",
  "this", "that", "from", "will", "our", "their", "they", "them", "who",
  "what", "when", "where", "why", "how", "all", "any", "can", "was", "were",
  "been", "being", "has", "had", "into", "out", "about", "over", "under",
  "more", "most", "some", "such", "than", "then", "there", "these", "those",
  "which", "while", "would", "could", "should", "also", "per", "etc",
]);

function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .match(/[a-z][a-z0-9+.#-]{1,}/g)
      ?.filter((w) => w.length > 2 && !STOPWORDS.has(w)) ?? []
  );
}

function termFreq(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/** Cosine similarity on raw term frequency (no corpus-wide IDF weighting —
 * this is a deliberately cheap approximation for a "browse more, lower
 * confidence" tier, not a replacement for the AI-scored shortlist). */
function cosineSim(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, freq] of a) {
    normA += freq * freq;
    const bFreq = b.get(term);
    if (bFreq) dot += freq * bFreq;
  }
  for (const freq of b.values()) normB += freq * freq;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const JOBS_CONSIDERED = 600; // recent jobs scanned per request — keeps this fast
const RESULTS_RETURNED = 60;

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

  const admin = supabaseAdmin();

  const [existingRes, jobsRes] = await Promise.all([
    admin.from("matches").select("job_id").eq("user_id", session.userId),
    admin
      .from("jobs")
      .select("id, title, company, location, apply_url, posted_at, description")
      .order("created_at", { ascending: false })
      .limit(JOBS_CONSIDERED),
  ]);

  if (jobsRes.error) {
    return NextResponse.json({ error: jobsRes.error.message }, { status: 500 });
  }

  type JobRow = {
    id: string;
    title: string;
    company: string;
    location: string;
    apply_url: string;
    posted_at: string | null;
    description: string;
  };
  type ScoredJob = { job: JobRow; score: number };

  const alreadyShortlisted = new Set((existingRes.data ?? []).map((r: { job_id: string }) => r.job_id));
  const resumeVec = termFreq(tokenize(body.resumeText));

  const scored: ScoredJob[] = ((jobsRes.data ?? []) as JobRow[])
    .filter((job) => !alreadyShortlisted.has(job.id))
    .map((job) => {
      const jdVec = termFreq(tokenize(`${job.title} ${stripHtml(job.description ?? "")}`));
      return { job, score: cosineSim(resumeVec, jdVec) };
    })
    .sort((a: ScoredJob, b: ScoredJob) => b.score - a.score)
    .slice(0, RESULTS_RETURNED);

  const results = scored.map(({ job, score }) => ({
    job_id: job.id,
    score,
    title: job.title,
    company: job.company,
    location: job.location,
    apply_url: job.apply_url,
    posted_at: job.posted_at,
  }));

  return NextResponse.json({ matches: results, scanned: (jobsRes.data ?? []).length });
}

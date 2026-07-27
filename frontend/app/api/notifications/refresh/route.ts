import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/groqServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Runs server-side only. `notifications` is system-written by design (see
// supabase_migration_003 — RLS has no insert policy for authenticated
// users, only select/update), so generating them has to happen here with
// the service-role client, scoped to whichever user the session verifies
// as. Called from the client on load (NotificationBell) rather than a
// cron job — no new infra, and it stays entirely on the Next.js side of
// the stack, not the Python ingestion pipeline.
export const runtime = "nodejs";

const FOLLOW_UP_DAYS = 7;
const INTERVIEW_WINDOW_HOURS = 24;
const NEW_MATCH_THRESHOLD = 0.8;
const NOTIFICATION_TYPES = ["follow_up", "interview_reminder", "new_match"];

type Candidate = { user_id: string; type: string; title: string; body: string; metadata: Record<string, unknown> };

export async function POST(req: NextRequest) {
  const session = await verifySession(req);
  if ("error" in session) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const userId = session.userId;
  const admin = supabaseAdmin();

  const [matchesRes, interviewsRes, existingRes] = await Promise.all([
    admin
      .from("matches")
      .select("job_id, fit_score, status, applied_at, jobs(title, company)")
      .eq("user_id", userId),
    admin
      .from("interviews")
      .select("id, company, role, scheduled_at")
      .eq("user_id", userId)
      .not("scheduled_at", "is", null),
    admin.from("notifications").select("type, metadata").eq("user_id", userId).in("type", NOTIFICATION_TYPES),
  ]);

  const matches = (matchesRes.data ?? []) as unknown as {
    job_id: string;
    fit_score: number | null;
    status: string;
    applied_at: string | null;
    jobs: { title: string; company: string } | null;
  }[];
  const interviews = (interviewsRes.data ?? []) as unknown as {
    id: number;
    company: string;
    role: string;
    scheduled_at: string | null;
  }[];

  const existingKeys = new Set(
    (existingRes.data ?? []).map((n) => {
      const m = n.metadata as Record<string, unknown>;
      return `${n.type}:${m?.job_id ?? m?.interview_id ?? ""}`;
    })
  );

  const now = Date.now();
  const toInsert: Candidate[] = [];

  for (const m of matches) {
    if (existingKeys.has(`follow_up:${m.job_id}`)) continue;
    if (m.status === "applied" && m.applied_at && now - new Date(m.applied_at).getTime() >= FOLLOW_UP_DAYS * 86400000) {
      toInsert.push({
        user_id: userId,
        type: "follow_up",
        title: "Time to follow up",
        body: `It's been a week since you applied to ${m.jobs?.title ?? "a role"} at ${m.jobs?.company ?? "a company"} — worth a nudge.`,
        metadata: { job_id: m.job_id },
      });
    }
  }

  for (const m of matches) {
    if (existingKeys.has(`new_match:${m.job_id}`)) continue;
    if (m.status === "new" && (m.fit_score ?? 0) >= NEW_MATCH_THRESHOLD) {
      toInsert.push({
        user_id: userId,
        type: "new_match",
        title: "Strong new match",
        body: `${Math.round((m.fit_score ?? 0) * 100)}% fit: ${m.jobs?.title ?? "a role"} at ${m.jobs?.company ?? "a company"}.`,
        metadata: { job_id: m.job_id },
      });
    }
  }

  for (const iv of interviews) {
    if (!iv.scheduled_at || existingKeys.has(`interview_reminder:${iv.id}`)) continue;
    const diff = new Date(iv.scheduled_at).getTime() - now;
    if (diff > 0 && diff <= INTERVIEW_WINDOW_HOURS * 3600000) {
      toInsert.push({
        user_id: userId,
        type: "interview_reminder",
        title: "Interview coming up",
        body: `${iv.role || "Your interview"} with ${iv.company} is within 24 hours.`,
        metadata: { interview_id: iv.id },
      });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await admin.from("notifications").insert(toInsert);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ created: toInsert.length });
}

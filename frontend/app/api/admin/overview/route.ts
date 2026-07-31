import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { APPLIED_STATUSES } from "@/lib/types";

export const runtime = "nodejs";

export type AdminUserSummary = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  matches_count: number;
  applied_count: number;
  has_resume: boolean;
  activity_count: number;
  last_active_at: string | null;
};

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req);
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const db = supabaseAdmin();

  const { data: usersPage, error: usersError } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  // Every per-user count below comes from a single unfiltered query rather
  // than N per-user queries — this is a small personal project's user base,
  // so pulling everything once and aggregating in memory is simpler and
  // cheaper than a round trip per user.
  const [matchesRes, resumeRes, activityRes] = await Promise.all([
    db.from("matches").select("user_id, status"),
    db.from("resume_versions").select("user_id").eq("is_default", true),
    db.from("activity_log").select("user_id, created_at"),
  ]);
  if (matchesRes.error) return NextResponse.json({ error: matchesRes.error.message }, { status: 500 });
  if (resumeRes.error) return NextResponse.json({ error: resumeRes.error.message }, { status: 500 });
  if (activityRes.error) return NextResponse.json({ error: activityRes.error.message }, { status: 500 });

  const matchCounts = new Map<string, { total: number; applied: number }>();
  for (const m of matchesRes.data) {
    const entry = matchCounts.get(m.user_id) ?? { total: 0, applied: 0 };
    entry.total += 1;
    if (APPLIED_STATUSES.includes(m.status)) entry.applied += 1;
    matchCounts.set(m.user_id, entry);
  }

  const hasResume = new Set(resumeRes.data.map((r) => r.user_id));

  const activityStats = new Map<string, { count: number; lastAt: string }>();
  for (const a of activityRes.data) {
    const entry = activityStats.get(a.user_id);
    if (!entry) {
      activityStats.set(a.user_id, { count: 1, lastAt: a.created_at });
    } else {
      entry.count += 1;
      if (a.created_at > entry.lastAt) entry.lastAt = a.created_at;
    }
  }

  const users: AdminUserSummary[] = usersPage.users.map((u) => {
    const matches = matchCounts.get(u.id) ?? { total: 0, applied: 0 };
    const activity = activityStats.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "(no email)",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      matches_count: matches.total,
      applied_count: matches.applied,
      has_resume: hasResume.has(u.id),
      activity_count: activity?.count ?? 0,
      last_active_at: activity?.lastAt ?? null,
    };
  });

  users.sort((a, b) => (b.last_active_at ?? b.created_at).localeCompare(a.last_active_at ?? a.created_at));

  return NextResponse.json({ users });
}

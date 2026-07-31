import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const ROW_LIMIT = 200;

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req);
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const userId = req.nextUrl.searchParams.get("userId");
  const db = supabaseAdmin();

  let query = db
    .from("activity_log")
    .select("id, user_id, entity_type, entity_id, action, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ activity: data });
}

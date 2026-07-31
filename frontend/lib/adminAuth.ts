import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AdminResult = { userId: string; email: string } | { error: string; status: number };

/** Same bearer-token verification as verifySession (lib/groqServer.ts), plus
 * an allowlist check against ADMIN_EMAILS. This is the real security
 * boundary for every /api/admin/* route — the admin page itself is just a
 * normal client route reachable by anyone who knows the URL, so every route
 * under it must independently re-check this before returning any
 * cross-user data. Never trust a client-side "am I the admin" check alone. */
export async function verifyAdmin(req: Request): Promise<AdminResult> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Missing auth token", status: 401 };

  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user?.email) return { error: "Invalid or expired session", status: 401 };

  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!allowlist.includes(data.user.email.toLowerCase())) {
    return { error: "Not authorized", status: 403 };
  }

  return { userId: data.user.id, email: data.user.email };
}

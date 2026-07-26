import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client — never import this from a client component. Used
// only in API routes to verify a caller's access token before doing
// anything that costs money (e.g. an LLM call), since RLS alone doesn't
// stop an unauthenticated request from reaching a server route at all.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY server env vars.");
  }

  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

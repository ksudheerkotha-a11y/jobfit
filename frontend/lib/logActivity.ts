import { supabase } from "@/lib/supabase";

export type EntityType = "application" | "resume" | "cover_letter" | "job" | "interview" | "profile";

/** Fire-and-forget: an activity log write failing should never block the
 * real action (status change, resume save, ...) it's recording. RLS scopes
 * this to the caller's own rows — see supabase_migration_003. userId is a
 * required param rather than fetched internally: every call site already
 * has the session in scope, so this avoids an extra auth round-trip per log
 * write. */
export function logActivity(
  userId: string,
  entityType: EntityType,
  entityId: string,
  action: string,
  metadata: Record<string, unknown> = {}
): void {
  supabase
    .from("activity_log")
    .insert({ user_id: userId, entity_type: entityType, entity_id: entityId, action, metadata })
    .then(({ error }) => {
      if (error) console.warn("activity log write failed:", error.message);
    });
}

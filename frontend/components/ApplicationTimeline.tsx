"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ActivityRow, describeActivity, relativeTime } from "@/lib/activityDescribe";

/** Per-application history — the same activity_log rows ActivityFeed reads
 * from the dashboard, filtered to one job. Real data as of Phase 2 (that's
 * when status changes, notes, cover letters etc. started actually writing
 * to activity_log); anything before that deploy has no record. */
export function ApplicationTimeline({ userId, jobId }: { userId: string; jobId: string }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("activity_log")
      .select("id, entity_type, entity_id, action, metadata, created_at")
      .eq("user_id", userId)
      .eq("entity_type", "application")
      .eq("entity_id", jobId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as ActivityRow[]) ?? []));
  }, [userId, jobId]);

  if (rows === null) {
    return <p className="hint" style={{ margin: 0 }}>Loading timeline...</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="hint" style={{ margin: 0 }}>
        No recorded history for this application yet — actions from here on will show up.
      </p>
    );
  }

  return (
    <ul className="activity-list">
      {rows.map((row) => (
        <li key={row.id} className="activity-row">
          <span className="activity-text">{describeActivity(row)}</span>
          <span className="activity-time">{relativeTime(row.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

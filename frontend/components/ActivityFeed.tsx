"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ActivityIcon } from "@/components/icons";
import { ActivityRow, describeActivity, relativeTime } from "@/lib/activityDescribe";

export function ActivityFeed({ userId }: { userId: string }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("activity_log")
      .select("id, entity_type, entity_id, action, metadata, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => setRows((data as ActivityRow[]) ?? []));
  }, [userId]);

  return (
    <div className="card">
      <h2 className="card-title-icon" style={{ marginBottom: "0.75rem" }}>
        <ActivityIcon size={17} />
        Recent activity
      </h2>
      {rows === null ? (
        <div className="skeleton-table">
          {Array.from({ length: 3 }).map((_, i) => (
            <div className="skeleton-row" key={i} style={{ height: 32 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          No activity yet — actions you take (saving a resume, changing a status, generating a cover
          letter) will show up here.
        </p>
      ) : (
        <ul className="activity-list">
          {rows.map((row) => (
            <li key={row.id} className="activity-row">
              <span className="activity-text">{describeActivity(row)}</span>
              <span className="activity-time">{relativeTime(row.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ActivityIcon } from "@/components/icons";

type ActivityRow = {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

const ACTION_LABELS: Record<string, (m: Record<string, unknown>) => string> = {
  status_changed: (m) => `Moved ${m.title ?? "an application"} at ${m.company ?? "?"} to "${m.to}"`,
  note_added: (m) => `Added a note on ${m.title ?? "an application"} at ${m.company ?? "?"}`,
  resume_updated: () => "Updated your resume",
  cover_letter_generated: (m) => `Drafted a cover letter for ${m.title ?? "a role"} at ${m.company ?? "?"}`,
  resume_tailored: (m) => `Tailored your resume for ${m.title ?? "a role"} at ${m.company ?? "?"}`,
  referral_drafted: (m) => `Drafted a referral ask to ${m.contact ?? "a contact"} at ${m.company ?? "?"}`,
};

function describe(row: ActivityRow): string {
  const fn = ACTION_LABELS[row.action];
  return fn ? fn(row.metadata) : row.action.replace(/_/g, " ");
}

function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

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
              <span className="activity-text">{describe(row)}</span>
              <span className="activity-time">{relativeTime(row.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

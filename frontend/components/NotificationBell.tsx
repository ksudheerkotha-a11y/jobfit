"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Notification } from "@/lib/types";
import { relativeTime } from "@/lib/activityDescribe";
import { BellIcon } from "@/components/icons";

function destinationFor(n: Notification): string {
  return n.type === "interview_reminder" ? "/interviews" : "/";
}

export function NotificationBell({ session }: { session: Session }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Notifications are system-written (no client insert policy — see
    // supabase_migration_003), so generating any new ones has to happen
    // server-side first; this call is what actually creates them.
    fetch("/api/notifications/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .catch(() => {})
      .then(() => {
        supabase
          .from("notifications")
          .select("id, type, title, body, is_read, metadata, created_at")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(20)
          .then(({ data }) => setNotifications((data as Notification[]) ?? []));
      });
  }, [session]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function markRead(id: number) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
  }

  return (
    <div className="notification-bell-wrap" ref={containerRef}>
      <button
        type="button"
        className="ghost icon-btn notification-bell-button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
      >
        <BellIcon size={17} />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      {open && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="icon-link" onClick={markAllRead}>
                Mark all as read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="hint" style={{ margin: "0.75rem", textAlign: "center" }}>
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="notification-list">
              {notifications.map((n) => (
                <li key={n.id} className={n.is_read ? "notification-item" : "notification-item notification-item-unread"}>
                  <Link
                    href={destinationFor(n)}
                    className="notification-link"
                    onClick={() => {
                      if (!n.is_read) markRead(n.id);
                      setOpen(false);
                    }}
                  >
                    <p style={{ margin: 0, fontWeight: 600, fontSize: "0.8125rem" }}>{n.title}</p>
                    <p className="hint" style={{ margin: "0.15rem 0 0" }}>{n.body}</p>
                    <span className="activity-time">{relativeTime(n.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

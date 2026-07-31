"use client";

import { Fragment, useEffect, useState } from "react";
import { useSession } from "@/lib/useSession";
import { SignIn } from "@/components/SignIn";
import { AppHeader } from "@/components/AppHeader";
import { Logomark, UsersIcon } from "@/components/icons";
import { ActivityRow, describeActivity, relativeTime } from "@/lib/activityDescribe";
import type { AdminUserSummary } from "@/app/api/admin/overview/route";

// Per-request admin snapshot — never static, never cached.
export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminPage() {
  const { session, loadingSession } = useSession();
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activityByUser, setActivityByUser] = useState<Record<string, ActivityRow[]>>({});
  const [activityLoading, setActivityLoading] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setLoadError(null);
    setForbidden(false);

    fetch("/api/admin/overview", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(async (res) => {
        const data = await res.json();
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setUsers(data.users as AdminUserSummary[]);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load admin data"));
  }, [session]);

  async function toggleUser(userId: string) {
    if (expandedId === userId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(userId);
    if (activityByUser[userId] || !session) return;

    setActivityLoading(userId);
    setActivityError(null);
    try {
      const res = await fetch(`/api/admin/activity?userId=${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load activity");
      setActivityByUser((prev) => ({ ...prev, [userId]: data.activity as ActivityRow[] }));
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setActivityLoading(null);
    }
  }

  if (loadingSession) {
    return (
      <main className="container center-page">
        <div className="skeleton-spinner" aria-label="Loading" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="container center-page">
        <div>
          <div className="brand brand-centered" style={{ marginBottom: "1.5rem" }}>
            <Logomark size={40} />
            <h1>jobfit</h1>
            <p className="tagline">Fewer, better, real job matches.</p>
          </div>
          <SignIn />
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <AppHeader session={session} active="/admin" />

      <div className="card">
        <div className="card-header-static">
          <h2 className="card-title-icon" style={{ margin: 0 }}>
            <UsersIcon size={17} />
            Users
          </h2>
          {users && <span className="hint" style={{ margin: 0 }}>{users.length} total</span>}
        </div>

        {forbidden ? (
          <p className="error" style={{ marginTop: "0.85rem" }}>
            You&apos;re signed in as {session.user.email}, which isn&apos;t on the admin allowlist.
          </p>
        ) : loadError ? (
          <p className="error" style={{ marginTop: "0.85rem" }}>{loadError}</p>
        ) : users === null ? (
          <div className="skeleton-table" style={{ marginTop: "0.85rem" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div className="skeleton-row" key={i} />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="empty-state">No users yet.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: "0.85rem" }}>
            <table className="matches-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Joined</th>
                  <th>Last sign-in</th>
                  <th>Resume</th>
                  <th>Matches</th>
                  <th>Applied</th>
                  <th>Activity</th>
                  <th>Last active</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const expanded = expandedId === u.id;
                  return (
                    <Fragment key={u.id}>
                      <tr onClick={() => toggleUser(u.id)} style={{ cursor: "pointer" }}>
                        <td className="role-cell">
                          <div className="title">{u.email}</div>
                        </td>
                        <td>{formatDate(u.created_at)}</td>
                        <td>{formatDate(u.last_sign_in_at)}</td>
                        <td>
                          {u.has_resume ? (
                            <span className="badge badge-good">Yes</span>
                          ) : (
                            <span className="badge badge-muted">No</span>
                          )}
                        </td>
                        <td>{u.matches_count}</td>
                        <td>{u.applied_count}</td>
                        <td>{u.activity_count}</td>
                        <td>{u.last_active_at ? relativeTime(u.last_active_at) : "—"}</td>
                      </tr>
                      {expanded && (
                        <tr key={`${u.id}-detail`}>
                          <td colSpan={8}>
                            {activityLoading === u.id ? (
                              <p className="hint" style={{ margin: 0 }}>Loading activity...</p>
                            ) : activityError ? (
                              <p className="error" style={{ margin: 0 }}>{activityError}</p>
                            ) : !activityByUser[u.id] || activityByUser[u.id].length === 0 ? (
                              <p className="hint" style={{ margin: 0 }}>No activity recorded for this user yet.</p>
                            ) : (
                              <ul className="activity-list">
                                {activityByUser[u.id].map((row) => (
                                  <li key={row.id} className="activity-row">
                                    <span className="activity-text">{describeActivity(row)}</span>
                                    <span className="activity-time">{relativeTime(row.created_at)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

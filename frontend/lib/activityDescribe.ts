export type ActivityRow = {
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
  job_saved: (m) => `Saved ${m.title ?? "a job"} at ${m.company ?? "?"}`,
  job_unsaved: (m) => `Removed ${m.title ?? "a job"} at ${m.company ?? "?"} from saved`,
  resume_version_added: (m) => (m.tailored ? `Saved a tailored resume: "${m.title ?? "Untitled"}"` : `Added a resume version: "${m.title ?? "Untitled"}"`),
  resume_version_set_default: (m) => `Set "${m.title ?? "a resume"}" as your default resume`,
  resume_version_deleted: (m) => `Deleted resume version "${m.title ?? "Untitled"}"`,
  resume_analyzed: (m) => `Analyzed "${m.title ?? "a resume"}" — ATS score ${m.atsScore ?? "?"}`,
  interview_scheduled: (m) => `Scheduled a ${m.stage ?? "interview"} with ${m.company ?? "a company"}`,
  interview_updated: (m) => `Updated the interview with ${m.company ?? "a company"}`,
  interview_deleted: (m) => `Removed the interview with ${m.company ?? "a company"}`,
  followup_drafted: (m) => `Drafted a follow-up for ${m.title ?? "a role"} at ${m.company ?? "?"}`,
  interview_prepped: (m) => `Prepped for the ${m.stage ?? "interview"} with ${m.company ?? "a company"}`,
};

export function describeActivity(row: ActivityRow): string {
  const fn = ACTION_LABELS[row.action];
  return fn ? fn(row.metadata) : row.action.replace(/_/g, " ");
}

export function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export type MatchStatus =
  | "new"
  | "applied"
  | "phone_screen"
  | "onsite"
  | "offer"
  | "rejected"
  | "dismissed";

export const STATUS_LABELS: Record<MatchStatus, string> = {
  new: "New",
  applied: "Applied",
  phone_screen: "Phone screen",
  onsite: "Onsite",
  offer: "Offer",
  rejected: "Rejected",
  dismissed: "Dismissed",
};

// Pipeline order — shared by the table's stage <select> and the Kanban
// board's columns, so the two views never drift out of sync.
export const STATUS_OPTIONS: MatchStatus[] = [
  "new",
  "applied",
  "phone_screen",
  "onsite",
  "offer",
  "rejected",
  "dismissed",
];

// A match "counts as applied" for follow-up nudging once it's moved past
// New — including later pipeline stages, since applied_at is set once and
// never cleared going forward.
export const APPLIED_STATUSES: MatchStatus[] = [
  "applied",
  "phone_screen",
  "onsite",
  "offer",
  "rejected",
];

// Shared by every page that reads the shortlist (dashboard, analytics) so
// the query shape can't drift between them.
export const MATCHES_SELECT =
  "job_id, fit_score, missing_skills, reasons, status, notes, applied_at, jobs(title, company, location, apply_url, posted_at, description)";

export type MatchedJobRow = {
  job_id: string;
  fit_score: number;
  missing_skills: string[];
  reasons: string[];
  status: MatchStatus;
  notes: string;
  applied_at: string | null;
  jobs: {
    title: string;
    company: string;
    location: string;
    apply_url: string;
    posted_at: string | null;
    description: string;
  } | null;
};

export type Contact = {
  id: number;
  name: string;
  company: string;
  context: string;
};

export type JobRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  apply_url: string;
  posted_at: string | null;
};

export type SavedJob = {
  id: number;
  job_id: string;
  created_at: string;
  jobs: JobRow | null;
};

export type InterviewStage = "phone_screen" | "technical" | "onsite" | "final_round" | "other";

export const INTERVIEW_STAGE_LABELS: Record<InterviewStage, string> = {
  phone_screen: "Phone screen",
  technical: "Technical",
  onsite: "Onsite",
  final_round: "Final round",
  other: "Other",
};

export const INTERVIEW_STAGE_OPTIONS: InterviewStage[] = [
  "phone_screen",
  "technical",
  "onsite",
  "final_round",
  "other",
];

export type Interview = {
  id: number;
  job_id: string | null;
  company: string;
  role: string;
  stage: string;
  scheduled_at: string | null;
  meeting_link: string | null;
  notes: string;
  created_at: string;
};

export type ResumeVersion = {
  id: number;
  title: string;
  version_name: string | null;
  resume_text: string;
  source_resume_id: number | null;
  ats_score: number | null;
  keywords: string[];
  is_default: boolean;
  created_at: string;
};

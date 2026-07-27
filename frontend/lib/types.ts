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

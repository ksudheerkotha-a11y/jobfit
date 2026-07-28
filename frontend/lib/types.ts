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

export type Notification = {
  id: number;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

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

export type FormatPrefs = {
  template: "standard" | "jake";
  font: string;
  fontSize: number;
  align: "left" | "justified";
  fitToOnePage: boolean;
  sectionOrder: string[];
};

export const DEFAULT_FORMAT_PREFS: FormatPrefs = {
  template: "standard",
  font: "Arial",
  fontSize: 10.5,
  align: "left",
  fitToOnePage: true,
  sectionOrder: ["summary", "experience", "education", "skills"],
};

export const RESUME_FONTS = ["Arial", "Helvetica", "Georgia", "Times New Roman", "Calibri"];

export type ResumeVersion = {
  id: number;
  title: string;
  version_name: string | null;
  resume_text: string;
  source_resume_id: number | null;
  ats_score: number | null;
  keywords: string[];
  is_default: boolean;
  format_prefs: Partial<FormatPrefs>;
  created_at: string;
};

// Buttons on the Auto Apply settings screen — a label over the same
// fit_score scale everything else already uses (0-1), so "Excellent"
// picks the same bar the dashboard's stats already compute against.
export const QUALITY_TIERS = [
  { label: "Excellent", value: 0.85 },
  { label: "Strong", value: 0.75 },
  { label: "Good", value: 0.65 },
  { label: "Stretch", value: 0.5 },
] as const;

export type AutoApplySettings = {
  enabled: boolean;
  min_fit_score: number;
  daily_cap: number;
  resume_version_id: number | null;
  updated_at: string;
};

export type AutoApplyQueueStatus = "queued" | "applied" | "dismissed";

// Shared by the Auto Apply page and the server-side queue generator so the
// query shape can't drift between them.
export const AUTO_APPLY_QUEUE_SELECT =
  "id, job_id, cover_letter_draft, tailored_resume_draft, status, created_at, jobs(title, company, location, apply_url, posted_at, description)";

export type AutoApplyQueueItem = {
  id: number;
  job_id: string;
  cover_letter_draft: string;
  tailored_resume_draft: string;
  status: AutoApplyQueueStatus;
  created_at: string;
  jobs: {
    title: string;
    company: string;
    location: string;
    apply_url: string;
    posted_at: string | null;
    description: string;
  } | null;
};

export type Profile = {
  full_name: string;
  open_to_work: boolean;
  location: string;
  phone: string;
  professional_summary: string;
  work_authorized: boolean;
  needs_sponsorship: boolean;
  in_person_ok: boolean;
  can_relocate: boolean;
  start_immediately: boolean;
  has_transport: boolean;
  needs_accommodations: boolean;
  prior_employee: boolean;
  gov_clearance: boolean;
  gov_ties: boolean;
  updated_at: string;
};

export type EducationEntry = {
  id: number;
  school: string;
  degree: string;
  field: string;
  start_date: string;
  end_date: string;
  sort_order: number;
};

export type ExperienceEntry = {
  id: number;
  title: string;
  company: string;
  location: string;
  start_date: string;
  end_date: string;
  bullets: string[];
  sort_order: number;
};

export type SkillEntry = {
  id: number;
  category: string;
  skill: string;
  sort_order: number;
};

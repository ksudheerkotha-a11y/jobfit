export type MatchStatus = "new" | "applied" | "dismissed";

export type MatchedJobRow = {
  job_id: string;
  fit_score: number;
  missing_skills: string[];
  reasons: string[];
  status: MatchStatus;
  jobs: {
    title: string;
    company: string;
    location: string;
    apply_url: string;
    posted_at: string | null;
    description: string;
  } | null;
};

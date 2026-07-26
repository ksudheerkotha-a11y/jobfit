export type MatchedJobRow = {
  fit_score: number;
  missing_skills: string[];
  reasons: string[];
  status: string;
  jobs: {
    title: string;
    company: string;
    location: string;
    apply_url: string;
    posted_at: string | null;
    description: string;
  } | null;
};

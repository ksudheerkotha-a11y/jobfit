#!/usr/bin/env python3
"""Scheduled batch, stage 2: score every stored job against every user's
resume, gate on fit, upsert into Supabase `matches`. Runs after ingest.py
(see .github/workflows/ingest.yml).

    JOBFIT_DRY_RUN=1 python match.py --scorer local   # prints, writes nothing
    python match.py --scorer local                    # writes to Supabase

In dry-run mode there's no `resumes` table to read from, so this scores a
single resume passed via --resume (defaults to the fixture resume) against
whatever ingest.py cached locally.
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

from jobfit.pipeline import run_pipeline
from jobfit.resume import load_resume
from jobfit.scoring import get_scorer
from jobfit.storage import DRY_RUN, fetch_jobs, fetch_resumes, upsert_matches

DEMO_RESUME = Path(__file__).parent / "fixtures" / "sample_resume.txt"


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--scorer", choices=["local", "claude"], default="local")
    parser.add_argument("--min-fit", type=float, default=0.35)
    parser.add_argument(
        "--resume",
        default=str(DEMO_RESUME),
        help="Dry-run only: resume to score against (real runs read every row of `resumes`)",
    )
    args = parser.parse_args()

    scorer = get_scorer(args.scorer)
    jobs = fetch_jobs()
    logging.info("Loaded %d jobs to score", len(jobs))

    if DRY_RUN:
        resume_text = load_resume(args.resume)
        matches = run_pipeline(jobs, resume_text, scorer, min_fit=args.min_fit)
        logging.info("[dry-run] %d matches for demo resume %s", len(matches), args.resume)
        upsert_matches(user_id="dry-run-user", matches=matches)
        return

    resumes = fetch_resumes()
    logging.info("Scoring against %d user resumes", len(resumes))
    for resume_row in resumes:
        resume_text = resume_row["resume_text"]
        matches = run_pipeline(jobs, resume_text, scorer, min_fit=args.min_fit)
        upsert_matches(user_id=resume_row["user_id"], matches=matches)
        logging.info("%d matches for user %s", len(matches), resume_row["user_id"])


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""See the whole pipeline run offline against fixtures. No network needed.

This is the fastest way to see what jobfit does: fixtures/sample_jobs.json
stands in for live Greenhouse/Lever data (including a stale posting, a ghost
listing, and a cross-posted duplicate, so you can see every filter fire), and
fixtures/sample_resume.txt stands in for --resume.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from jobfit.cli import print_table
from jobfit.models import Job
from jobfit.pipeline import run_pipeline
from jobfit.scoring import LocalScorer

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture_jobs() -> list[Job]:
    raw_jobs = json.loads((FIXTURES / "sample_jobs.json").read_text())
    jobs = []
    for raw in raw_jobs:
        posted_at = date.fromisoformat(raw["posted_at"]) if raw.get("posted_at") else None
        jobs.append(
            Job(
                source=raw["source"],
                external_id=raw["external_id"],
                company=raw["company"],
                title=raw["title"],
                location=raw["location"],
                description=raw["description"],
                apply_url=raw["apply_url"],
                posted_at=posted_at,
                department=raw.get("department"),
                raw=raw,
            )
        )
    return jobs


def main() -> None:
    jobs = load_fixture_jobs()
    resume_text = (FIXTURES / "sample_resume.txt").read_text()

    print(f"Loaded {len(jobs)} fixture jobs and a sample resume.\n")

    matches = run_pipeline(
        jobs,
        resume_text,
        scorer=LocalScorer(),
        min_fit=0.2,
        max_age_days=30,
        top=10,
    )

    print(
        f"After freshness/ghost/dedupe filters and a 0.20 fit gate, "
        f"{len(matches)} of {len(jobs)} jobs made the shortlist:\n"
    )
    print_table(matches)


if __name__ == "__main__":
    main()

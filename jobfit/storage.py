"""Supabase read/write layer for ingest.py and match.py.

Respects JOBFIT_DRY_RUN=1: writes print the payload instead of hitting
Supabase, and upsert_jobs() caches its payload locally so match.py has
something real to score against without a Supabase project configured.
"""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path
from typing import Any

from jobfit.models import Job, MatchedJob

DRY_RUN = os.environ.get("JOBFIT_DRY_RUN") == "1"
DRY_RUN_JOBS_CACHE = Path(".jobfit_dry_run_jobs.json")


def _job_to_row(job: Job) -> dict[str, Any]:
    return {
        "id": job.id,
        "source": job.source,
        "external_id": job.external_id,
        "company": job.company,
        "title": job.title,
        "location": job.location,
        "description": job.description,
        "apply_url": job.apply_url,
        "posted_at": job.posted_at.isoformat() if job.posted_at else None,
        "department": job.department,
    }


def _row_to_job(row: dict[str, Any]) -> Job:
    posted_at = date.fromisoformat(row["posted_at"]) if row.get("posted_at") else None
    return Job(
        source=row["source"],
        external_id=row["external_id"],
        company=row["company"],
        title=row["title"],
        location=row["location"],
        description=row["description"],
        apply_url=row["apply_url"],
        posted_at=posted_at,
        department=row.get("department"),
        raw=row,
    )


def _client():
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def _print_preview(label: str, rows: list[dict]) -> None:
    preview = rows[:3]
    print(f"[dry-run] would upsert {len(rows)} row(s) into `{label}`:")
    print(json.dumps(preview, indent=2, default=str))
    if len(rows) > len(preview):
        print(f"... and {len(rows) - len(preview)} more")


def upsert_jobs(jobs: list[Job]) -> None:
    rows = [_job_to_row(j) for j in jobs]
    if DRY_RUN:
        _print_preview("jobs", rows)
        DRY_RUN_JOBS_CACHE.write_text(json.dumps(rows, indent=2))
        print(f"[dry-run] cached full payload to {DRY_RUN_JOBS_CACHE} for match.py to read")
        return

    _client().table("jobs").upsert(rows).execute()


def fetch_jobs() -> list[Job]:
    """Read back normalized Job objects: from Supabase normally, or (dry-run)
    from the local cache upsert_jobs() just wrote."""
    if DRY_RUN:
        if not DRY_RUN_JOBS_CACHE.exists():
            raise FileNotFoundError(
                f"{DRY_RUN_JOBS_CACHE} not found. Run "
                "`JOBFIT_DRY_RUN=1 python ingest.py --config config.yaml` first."
            )
        rows = json.loads(DRY_RUN_JOBS_CACHE.read_text())
    else:
        rows = _client().table("jobs").select("*").execute().data

    return [_row_to_job(row) for row in rows]


def fetch_resumes() -> list[dict[str, str]]:
    """[{"user_id": ..., "resume_text": ...}, ...] — one per user with a resume
    on file. Dry-run has no `resumes` table to read; match.py handles that by
    taking a --resume path instead."""
    if DRY_RUN:
        return []
    return _client().table("resumes").select("user_id, resume_text").execute().data


def upsert_matches(user_id: str, matches: list[MatchedJob]) -> None:
    rows = [
        {
            "user_id": user_id,
            "job_id": m.job.id,
            "fit_score": round(m.score.fit_score, 4),
            "missing_skills": m.score.missing_skills,
            "reasons": m.score.reasons,
            "status": "new",
        }
        for m in matches
    ]
    if DRY_RUN:
        _print_preview("matches", rows)
        return

    _client().table("matches").upsert(rows).execute()

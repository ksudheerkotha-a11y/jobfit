"""Ashby public job board API -> normalized Job objects.

No auth required. Board name is the slug in jobs.ashbyhq.com/<board>.
Docs: https://developers.ashbyhq.com/reference/jobpostingapi
"""

from __future__ import annotations

from datetime import datetime

import requests

from jobfit.models import Job

API_URL = "https://api.ashbyhq.com/posting-api/job-board/{board}"
TIMEOUT_SECONDS = 15


def fetch_ashby(board: str) -> list[Job]:
    resp = requests.get(API_URL.format(board=board), timeout=TIMEOUT_SECONDS)
    resp.raise_for_status()
    data = resp.json()

    return [_to_job(board, raw) for raw in data.get("jobs", [])]


def _to_job(board: str, raw: dict) -> Job:
    location = raw.get("location", "") or ""
    if raw.get("isRemote") and "remote" not in location.lower():
        location = f"{location} (Remote)" if location else "Remote"

    posted_at = None
    published_at = raw.get("publishedAt")
    if published_at:
        try:
            posted_at = datetime.fromisoformat(published_at.replace("Z", "+00:00")).date()
        except ValueError:
            posted_at = None

    return Job(
        source="ashby",
        external_id=str(raw.get("id")),
        company=board,
        title=raw.get("title", ""),
        location=location,
        description=raw.get("descriptionHtml", "") or "",
        apply_url=raw.get("applyUrl") or raw.get("jobUrl", ""),
        posted_at=posted_at,
        department=raw.get("department"),
        raw=raw,
    )

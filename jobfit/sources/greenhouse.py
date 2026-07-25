"""Greenhouse public job board API -> normalized Job objects.

No auth required. Token is the slug in boards.greenhouse.io/<token>.
Docs: https://developers.greenhouse.io/job-board.html
"""

from __future__ import annotations

from datetime import datetime

import requests

from jobfit.models import Job

API_URL = "https://boards-api.greenhouse.io/v1/boards/{token}/jobs"
TIMEOUT_SECONDS = 15


def fetch_greenhouse(token: str) -> list[Job]:
    resp = requests.get(
        API_URL.format(token=token),
        params={"content": "true"},
        timeout=TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    data = resp.json()

    jobs = []
    for raw in data.get("jobs", []):
        jobs.append(_to_job(token, raw))
    return jobs


def _to_job(token: str, raw: dict) -> Job:
    location = (raw.get("location") or {}).get("name", "") or ""
    departments = raw.get("departments") or []
    department = departments[0].get("name") if departments else None

    posted_at = None
    updated_at = raw.get("updated_at")
    if updated_at:
        try:
            posted_at = datetime.fromisoformat(updated_at.replace("Z", "+00:00")).date()
        except ValueError:
            posted_at = None

    return Job(
        source="greenhouse",
        external_id=str(raw.get("id")),
        company=token,
        title=raw.get("title", ""),
        location=location,
        description=raw.get("content", "") or "",
        apply_url=raw.get("absolute_url", ""),
        posted_at=posted_at,
        department=department,
        raw=raw,
    )

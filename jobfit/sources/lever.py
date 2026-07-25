"""Lever public postings API -> normalized Job objects.

No auth required. Slug is the slug in jobs.lever.co/<slug>.
Docs: https://github.com/lever/postings-api
"""

from __future__ import annotations

from datetime import datetime, timezone

import requests

from jobfit.models import Job

API_URL = "https://api.lever.co/v0/postings/{slug}"
TIMEOUT_SECONDS = 15


def fetch_lever(slug: str) -> list[Job]:
    resp = requests.get(
        API_URL.format(slug=slug),
        params={"mode": "json"},
        timeout=TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    data = resp.json()

    return [_to_job(slug, raw) for raw in data]


def _to_job(slug: str, raw: dict) -> Job:
    categories = raw.get("categories") or {}
    location = categories.get("location", "") or ""
    department = categories.get("department") or categories.get("team")

    posted_at = None
    created_at_ms = raw.get("createdAt")
    if created_at_ms:
        posted_at = datetime.fromtimestamp(created_at_ms / 1000, tz=timezone.utc).date()

    description = raw.get("descriptionPlain") or raw.get("description") or ""

    return Job(
        source="lever",
        external_id=str(raw.get("id")),
        company=slug,
        title=raw.get("text", ""),
        location=location,
        description=description,
        apply_url=raw.get("applyUrl") or raw.get("hostedUrl", ""),
        posted_at=posted_at,
        department=department,
        raw=raw,
    )

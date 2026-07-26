"""RemoteOK public API -> normalized Job objects.

No auth required, but RemoteOK's API terms ask that anything built on this
data link back to remoteok.com as the source (see the "legal" entry the API
itself returns first) — unlike the other sources here, this is a single
global feed of the site's latest ~100 remote postings across all companies,
not a per-company board, so config.yaml just needs `type: remoteok` with no
token/slug.
"""

from __future__ import annotations

from datetime import datetime, timezone

import requests

from jobfit.models import Job

API_URL = "https://remoteok.com/api"
TIMEOUT_SECONDS = 15


def fetch_remoteok() -> list[Job]:
    resp = requests.get(API_URL, timeout=TIMEOUT_SECONDS)
    resp.raise_for_status()
    data = resp.json()

    # First element is always a legal/attribution notice, not a job.
    return [_to_job(raw) for raw in data if raw.get("id")]


def _to_job(raw: dict) -> Job:
    posted_at = None
    epoch = raw.get("epoch")
    if epoch:
        posted_at = datetime.fromtimestamp(epoch, tz=timezone.utc).date()

    description = raw.get("description", "") or ""
    tags = raw.get("tags") or []
    if tags:
        description = f"{description}\n\nTags: {', '.join(tags)}"

    return Job(
        source="remoteok",
        external_id=str(raw.get("id")),
        company=raw.get("company", "") or "",
        title=raw.get("position", "") or "",
        location=raw.get("location") or "Remote",
        description=description,
        apply_url=raw.get("apply_url") or raw.get("url", ""),
        posted_at=posted_at,
        department=None,
        raw=raw,
    )

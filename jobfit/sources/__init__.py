"""Registry of ATS fetchers. Each fetcher takes a company config dict and
returns a list[Job]. See README's "Extending" section for adding new sources."""

from __future__ import annotations

import logging

from jobfit.models import Job
from jobfit.sources.greenhouse import fetch_greenhouse
from jobfit.sources.lever import fetch_lever

logger = logging.getLogger(__name__)

_FETCHERS = {
    "greenhouse": lambda cfg: fetch_greenhouse(cfg["token"]),
    "lever": lambda cfg: fetch_lever(cfg["slug"]),
}


def fetch_all(companies: list[dict]) -> list[Job]:
    """Fetch every configured company's board. A single company failing
    (network error, bad token, etc.) is logged and skipped rather than
    aborting the whole run."""
    jobs: list[Job] = []
    for cfg in companies:
        source_type = cfg.get("type")
        fetcher = _FETCHERS.get(source_type)
        if fetcher is None:
            logger.warning("Unknown source type %r in config, skipping", source_type)
            continue
        try:
            jobs.extend(fetcher(cfg))
        except Exception as exc:  # noqa: BLE001 - one bad company shouldn't kill the run
            label = cfg.get("token") or cfg.get("slug") or "?"
            logger.warning("Failed to fetch %s (%s): %s", source_type, label, exc)
    return jobs

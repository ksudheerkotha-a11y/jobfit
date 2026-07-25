"""Freshness, ghost-listing, dedupe, and fit-gating filters."""

from __future__ import annotations

import re
from datetime import date, timedelta

from jobfit.models import Job, MatchedJob

# Below this many characters of JD text, a posting is treated as low-signal /
# likely-ghost. This is a light heuristic, not a guarantee — see README.
GHOST_DESCRIPTION_MIN_CHARS = 300


def drop_stale(jobs: list[Job], max_age_days: int) -> list[Job]:
    """Keep jobs posted within max_age_days. Jobs with no posted_at (unknown
    age) are kept — we have no signal to drop them on."""
    cutoff = date.today() - timedelta(days=max_age_days)
    return [j for j in jobs if j.posted_at is None or j.posted_at >= cutoff]


def is_ghost(job: Job) -> bool:
    """Heuristic: a suspiciously short/empty JD is a weak signal of a
    low-effort or evergreen/ghost req."""
    text = re.sub(r"<[^>]+>", " ", job.description or "")
    text = re.sub(r"\s+", " ", text).strip()
    return len(text) < GHOST_DESCRIPTION_MIN_CHARS


def drop_ghosts(jobs: list[Job]) -> list[Job]:
    return [j for j in jobs if not is_ghost(j)]


def _dedupe_key(job: Job) -> tuple[str, str, str]:
    norm = lambda s: re.sub(r"\s+", " ", s.strip().lower())
    return (norm(job.company), norm(job.title), norm(job.location))


def dedupe(jobs: list[Job]) -> list[Job]:
    """Same role can appear more than once (e.g. cross-posted, or a company
    re-syncing their board). Keep the most complete (longest JD) copy."""
    best: dict[tuple[str, str, str], Job] = {}
    for job in jobs:
        key = _dedupe_key(job)
        current = best.get(key)
        if current is None or len(job.description or "") > len(current.description or ""):
            best[key] = job
    return list(best.values())


def gate_on_fit(matches: list[MatchedJob], min_fit: float) -> list[MatchedJob]:
    return [m for m in matches if m.score.fit_score >= min_fit]

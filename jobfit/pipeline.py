"""Orchestration: fetch -> drop stale -> drop ghost -> dedupe -> score -> gate -> rank."""

from __future__ import annotations

from jobfit.filters import dedupe, drop_ghosts, drop_stale, gate_on_fit
from jobfit.models import Job, MatchedJob
from jobfit.scoring import Scorer


def run_pipeline(
    jobs: list[Job],
    resume_text: str,
    scorer: Scorer,
    min_fit: float = 0.0,
    max_age_days: int | None = None,
    top: int | None = None,
) -> list[MatchedJob]:
    """Run the full filter -> score -> gate -> rank pipeline over already-fetched
    jobs. Fetching is kept separate (see jobfit.sources.fetch_all) so this
    function works the same whether jobs came from live boards or fixtures."""
    filtered = jobs
    if max_age_days is not None:
        filtered = drop_stale(filtered, max_age_days)
    filtered = drop_ghosts(filtered)
    filtered = dedupe(filtered)

    matched = [MatchedJob(job=job, score=scorer.score(resume_text, job)) for job in filtered]

    gated = gate_on_fit(matched, min_fit)
    ranked = sorted(gated, key=lambda m: m.score.fit_score, reverse=True)

    if top is not None:
        ranked = ranked[:top]
    return ranked

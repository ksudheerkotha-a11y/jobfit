"""Orchestration: fetch -> drop stale -> drop ghost -> dedupe -> score -> gate -> rank."""

from __future__ import annotations

import logging

from jobfit.filters import dedupe, drop_ghosts, drop_stale, gate_on_fit
from jobfit.models import Job, MatchedJob
from jobfit.scoring import LocalScorer, Scorer

logger = logging.getLogger(__name__)


def run_pipeline(
    jobs: list[Job],
    resume_text: str,
    scorer: Scorer,
    min_fit: float = 0.0,
    max_age_days: int | None = None,
    top: int | None = None,
    prefilter_top: int | None = None,
) -> list[MatchedJob]:
    """Run the full filter -> score -> gate -> rank pipeline over already-fetched
    jobs. Fetching is kept separate (see jobfit.sources.fetch_all) so this
    function works the same whether jobs came from live boards or fixtures.

    prefilter_top: when scorer is an LLM (one API call per job), scoring
    every job in a real config is slow, costly, and can blow through
    free-tier rate limits. If set, jobs are first ranked with the free
    LocalScorer and narrowed to the top N before the real `scorer` runs —
    so it only ever sees the candidates worth spending an API call on.
    """
    filtered = jobs
    if max_age_days is not None:
        filtered = drop_stale(filtered, max_age_days)
    filtered = drop_ghosts(filtered)
    filtered = dedupe(filtered)

    if prefilter_top is not None and len(filtered) > prefilter_top:
        local = LocalScorer()
        filtered = sorted(
            filtered, key=lambda job: local.score(resume_text, job).fit_score, reverse=True
        )[:prefilter_top]

    # An LLM scorer is one network call per job — occasional bad output or a
    # transient failure shouldn't discard every match already scored in this
    # run, especially with rate-limited free tiers where re-running is slow.
    matched = []
    for job in filtered:
        try:
            matched.append(MatchedJob(job=job, score=scorer.score(resume_text, job)))
        except Exception:
            logger.warning("Skipping %s — scorer failed", job.id, exc_info=True)

    gated = gate_on_fit(matched, min_fit)
    ranked = sorted(gated, key=lambda m: m.score.fit_score, reverse=True)

    if top is not None:
        ranked = ranked[:top]
    return ranked

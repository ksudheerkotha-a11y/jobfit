"""Orchestration: fetch -> drop stale -> drop ghost -> dedupe -> score -> gate -> rank."""

from __future__ import annotations

import logging
from collections import defaultdict

from jobfit.filters import dedupe, drop_ghosts, drop_stale, gate_on_fit
from jobfit.models import Job, MatchedJob
from jobfit.scoring import LocalScorer, Scorer

logger = logging.getLogger(__name__)


def _diversified_prefilter(
    jobs: list[Job], resume_text: str, local: LocalScorer, top_n: int
) -> list[Job]:
    """Rank each company's jobs locally, then round-robin across companies
    (best-from-each, then second-best-from-each, ...) instead of a pure
    global top-N. A single company's postings scoring unusually well on the
    free local scorer shouldn't be able to crowd every other company's
    genuinely good roles out of the (expensive) LLM-scoring pass — with a
    broad, cross-domain company list this isn't a corner case, it's routine."""
    by_company: dict[str, list[tuple[float, Job]]] = defaultdict(list)
    for job in jobs:
        by_company[job.company].append((local.score(resume_text, job).fit_score, job))
    for bucket in by_company.values():
        bucket.sort(key=lambda pair: pair[0], reverse=True)

    selected: list[Job] = []
    round_idx = 0
    while len(selected) < top_n:
        added = False
        for bucket in by_company.values():
            if round_idx < len(bucket):
                selected.append(bucket[round_idx][1])
                added = True
                if len(selected) >= top_n:
                    break
        if not added:
            break
        round_idx += 1
    return selected


def run_pipeline(
    jobs: list[Job],
    resume_text: str,
    scorer: Scorer,
    min_fit: float = 0.0,
    max_age_days: int | None = None,
    top: int | None = None,
    prefilter_top: int | None = None,
    skills: list[str] | None = None,
) -> list[MatchedJob]:
    """Run the full filter -> score -> gate -> rank pipeline over already-fetched
    jobs. Fetching is kept separate (see jobfit.sources.fetch_all) so this
    function works the same whether jobs came from live boards or fixtures.

    prefilter_top: when scorer is an LLM (one API call per job), scoring
    every job in a real config is slow, costly, and can blow through
    free-tier rate limits. If set, jobs are first ranked per-company with
    the free LocalScorer and narrowed to the top N via round-robin across
    companies (see _diversified_prefilter) — so it only ever sees the
    candidates worth spending an API call on, without one company's
    postings crowding out every other company's.

    skills: passed to the prefilter's LocalScorer (config.yaml's `skills:`
    list, if the caller has one) so pre-filtering uses the same skill
    vocabulary as an explicit --scorer local run, rather than always
    falling back to the generic default list.
    """
    filtered = jobs
    if max_age_days is not None:
        filtered = drop_stale(filtered, max_age_days)
    filtered = drop_ghosts(filtered)
    filtered = dedupe(filtered)

    if prefilter_top is not None and len(filtered) > prefilter_top:
        local = LocalScorer(skills=skills)
        filtered = _diversified_prefilter(filtered, resume_text, local, prefilter_top)

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

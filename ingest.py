#!/usr/bin/env python3
"""Scheduled batch, stage 1: fetch live boards, filter, upsert into Supabase
`jobs`. Runs on GitHub Actions every 6h (see .github/workflows/ingest.yml),
followed by match.py.

    JOBFIT_DRY_RUN=1 python ingest.py --config config.yaml   # prints, writes nothing
    python ingest.py --config config.yaml                    # writes to Supabase
"""

from __future__ import annotations

import argparse
import logging

from jobfit.config import load_config
from jobfit.filters import dedupe, drop_ghosts, drop_stale
from jobfit.sources import fetch_all
from jobfit.storage import upsert_jobs


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="Path to config.yaml")
    parser.add_argument("--max-age-days", type=int, default=30)
    args = parser.parse_args()

    config = load_config(args.config)

    jobs = fetch_all(config["companies"])
    logging.info("Fetched %d raw postings from %d companies", len(jobs), len(config["companies"]))

    jobs = drop_stale(jobs, args.max_age_days)
    jobs = drop_ghosts(jobs)
    jobs = dedupe(jobs)
    logging.info("%d postings survive freshness/ghost/dedupe filters", len(jobs))

    upsert_jobs(jobs)


if __name__ == "__main__":
    main()

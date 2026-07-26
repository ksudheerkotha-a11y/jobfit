"""CLI: python -m jobfit run --resume resume.pdf --config config.yaml ..."""

from __future__ import annotations

import argparse
import json
import logging
import sys

from jobfit.config import load_config
from jobfit.models import MatchedJob
from jobfit.pipeline import run_pipeline
from jobfit.resume import load_resume
from jobfit.scoring import get_scorer
from jobfit.sources import fetch_all


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="jobfit")
    subparsers = parser.add_subparsers(dest="command", required=True)

    run = subparsers.add_parser("run", help="Fetch live boards and rank fit against a resume")
    run.add_argument("--resume", required=True, help="Path to resume (.txt/.md/.pdf)")
    run.add_argument("--config", required=True, help="Path to config.yaml")
    run.add_argument("--scorer", choices=["local", "claude", "groq"], default="local")
    run.add_argument("--min-fit", type=float, default=0.0, help="Drop matches below this fit score (0-1)")
    run.add_argument("--max-age-days", type=int, default=None, help="Drop postings older than this")
    run.add_argument("--top", type=int, default=None, help="Keep only the top N ranked matches")
    run.add_argument(
        "--prefilter-top",
        type=int,
        default=20,
        help="For claude/groq scorers: only send the top N local-scored jobs to the API "
        "(ignored for --scorer local). Groq's free tier caps at 100k tokens/day, not "
        "just requests — each call costs a few thousand tokens, so keep this modest.",
    )
    run.add_argument("--out", default=None, help="Write ranked matches as JSON to this path")

    return parser


def print_table(matches: list[MatchedJob]) -> None:
    if not matches:
        print("No matches at or above the fit threshold.")
        return

    from tabulate import tabulate

    rows = [
        [
            f"{m.score.fit_score:.2f}",
            m.job.company,
            m.job.title,
            m.job.location,
            ", ".join(m.score.missing_skills[:5]) or "-",
        ]
        for m in matches
    ]
    print(tabulate(rows, headers=["fit", "company", "title", "location", "missing skills"]))


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "run":
        config = load_config(args.config)
        resume_text = load_resume(args.resume)
        scorer = get_scorer(args.scorer, skills=config.get("skills"))

        jobs = fetch_all(config["companies"])
        matches = run_pipeline(
            jobs,
            resume_text,
            scorer,
            min_fit=args.min_fit,
            max_age_days=args.max_age_days,
            top=args.top,
            prefilter_top=args.prefilter_top if args.scorer != "local" else None,
        )

        print_table(matches)

        if args.out:
            with open(args.out, "w", encoding="utf-8") as f:
                json.dump([m.to_dict() for m in matches], f, indent=2)
            print(f"\nWrote {len(matches)} matches to {args.out}")

        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())

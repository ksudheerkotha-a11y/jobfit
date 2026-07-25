"""Load config.yaml: companies to fetch + the skill vocabulary to score against."""

from __future__ import annotations

from pathlib import Path

import yaml


def load_config(path: str | Path) -> dict:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(
            f"Config not found: {p}. Copy config.example.yaml to config.yaml and edit it."
        )
    with p.open(encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    data.setdefault("companies", [])
    data.setdefault("skills", None)  # None -> scoring.DEFAULT_SKILLS
    return data

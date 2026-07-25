"""Core data types shared across sources, filters, scoring, and storage."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any


@dataclass
class Job:
    """A normalized job posting, regardless of which ATS it came from."""

    source: str  # "greenhouse" | "lever"
    external_id: str  # the ATS's own id for this posting
    company: str
    title: str
    location: str
    description: str
    apply_url: str
    posted_at: date | None = None
    department: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def id(self) -> str:
        """Stable identity for dedup/storage: same posting -> same id."""
        return f"{self.source}:{self.company}:{self.external_id}"


@dataclass
class ScoreResult:
    """Output of scoring one Job against one resume."""

    fit_score: float  # 0.0-1.0
    missing_skills: list[str]
    reasons: list[str]


@dataclass
class MatchedJob:
    """A Job plus its score, ready to gate/rank/serialize."""

    job: Job
    score: ScoreResult

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.job.id,
            "company": self.job.company,
            "title": self.job.title,
            "location": self.job.location,
            "apply_url": self.job.apply_url,
            "posted_at": self.job.posted_at.isoformat() if self.job.posted_at else None,
            "fit_score": round(self.score.fit_score, 4),
            "missing_skills": self.score.missing_skills,
            "reasons": self.score.reasons,
        }

"""Fit scoring: resume x job description -> ScoreResult.

Three scorers, same interface (`Scorer.score(resume_text, job) -> ScoreResult`):

- LocalScorer: TF-IDF cosine similarity + explicit skill-coverage. Free, fast,
  offline, keyword-aware rather than deeply semantic.
- ClaudeScorer: sends resume + JD to the Claude API for genuine semantic
  judgement. Requires ANTHROPIC_API_KEY and `pip install anthropic`.
- GroqScorer: same semantic-judgement approach via Groq's free-tier API
  (Llama models). Requires GROQ_API_KEY and `pip install groq`.

Both LLM scorers make one API call per job — see pipeline.run_pipeline's
prefilter_top, which pre-narrows the candidate list with LocalScorer first
so a real config (hundreds+ of jobs) doesn't blow through free-tier request
limits or run needlessly slowly/expensively.
"""

from __future__ import annotations

import json
import re
from typing import Protocol

from jobfit.models import Job, ScoreResult

# Reasonable generic default if a config doesn't supply its own `skills:` list.
DEFAULT_SKILLS = [
    "python", "javascript", "typescript", "react", "node.js", "sql",
    "postgres", "aws", "gcp", "azure", "docker", "kubernetes", "ci/cd",
    "rest api", "graphql", "machine learning", "data pipeline", "terraform",
    "go", "java",
]


class Scorer(Protocol):
    def score(self, resume_text: str, job: Job) -> ScoreResult: ...


# Free-tier LLM budgets are measured in tokens, not just requests — a raw
# Greenhouse/Lever description is often multi-KB of HTML that costs tokens
# without adding scoring signal. Strip it and cap length before it hits a
# prompt.
_MAX_JD_CHARS = 3000
_MAX_RESUME_CHARS = 4000


def _clean_for_prompt(text: str, max_chars: int) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def _find_skills(text: str, skills: list[str]) -> set[str]:
    text_l = text.lower()
    found = set()
    for skill in skills:
        pattern = r"\b" + re.escape(skill.lower()) + r"\b"
        if re.search(pattern, text_l):
            found.add(skill)
    return found


class LocalScorer:
    """TF-IDF cosine similarity blended with explicit skill coverage."""

    def __init__(self, skills: list[str] | None = None, tfidf_weight: float = 0.6):
        self.skills = skills or DEFAULT_SKILLS
        self.tfidf_weight = tfidf_weight

    def _tfidf_similarity(self, resume_text: str, jd_text: str) -> float:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        vectorizer = TfidfVectorizer(stop_words="english")
        try:
            matrix = vectorizer.fit_transform([resume_text, jd_text])
        except ValueError:
            # e.g. empty vocabulary after stop-word removal
            return 0.0
        sim = cosine_similarity(matrix[0:1], matrix[1:2])[0][0]
        return float(max(0.0, min(1.0, sim)))

    def score(self, resume_text: str, job: Job) -> ScoreResult:
        jd_text = f"{job.title}\n{job.description}"

        tfidf_sim = self._tfidf_similarity(resume_text, jd_text)

        jd_skills = _find_skills(jd_text, self.skills)
        resume_skills = _find_skills(resume_text, self.skills)
        missing = sorted(jd_skills - resume_skills)
        coverage = 1.0 if not jd_skills else len(jd_skills & resume_skills) / len(jd_skills)

        fit_score = self.tfidf_weight * tfidf_sim + (1 - self.tfidf_weight) * coverage

        reasons = [
            f"text similarity {tfidf_sim:.2f}",
            f"skill coverage {coverage:.2f} ({len(jd_skills & resume_skills)}/{len(jd_skills)} JD skills found)",
        ]

        return ScoreResult(fit_score=fit_score, missing_skills=missing, reasons=reasons)


_FIT_PROMPT = """You are scoring how well a candidate's resume fits a job description.

Resume:
{resume}

Job description ({title} at {company}):
{jd}

Respond with ONLY a JSON object, no other text, in this exact shape:
{{"fit_score": <float 0.0-1.0>, "missing_skills": [<string>, ...], "reasons": [<string>, ...]}}

fit_score: overall likelihood this candidate would be a strong fit, 0.0 (no fit) to 1.0 (excellent fit).
missing_skills: specific skills/requirements the JD asks for that the resume does not demonstrate.
reasons: 2-4 short bullet-style strings explaining the score.
"""


class ClaudeScorer:
    """Uses the Claude API for semantic fit judgement instead of keyword overlap."""

    def __init__(self, model: str = "claude-sonnet-5", client=None):
        if client is not None:
            self.client = client
        else:
            import anthropic

            self.client = anthropic.Anthropic()
        self.model = model

    def score(self, resume_text: str, job: Job) -> ScoreResult:
        prompt = _FIT_PROMPT.format(
            resume=_clean_for_prompt(resume_text, _MAX_RESUME_CHARS),
            title=job.title,
            company=job.company,
            jd=_clean_for_prompt(job.description, _MAX_JD_CHARS),
        )
        response = self.client.messages.create(
            model=self.model,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )
        data = _extract_json(text)
        return ScoreResult(
            fit_score=float(data.get("fit_score", 0.0)),
            missing_skills=list(data.get("missing_skills", [])),
            reasons=list(data.get("reasons", [])),
        )


class GroqScorer:
    """Uses Groq's free-tier API (Llama models) for semantic fit judgement —
    a no-cost alternative to ClaudeScorer. Get a free key at console.groq.com.

    The free tier caps at 30 requests/minute; pacing calls to stay just under
    that (rather than firing as fast as possible and relying on 429 retries)
    is both faster in practice and avoids hammering the API with requests
    that are just going to be rejected.
    """

    MIN_INTERVAL_SECONDS = 2.1  # ~28.5 req/min, just under the 30 RPM cap

    def __init__(self, model: str = "llama-3.3-70b-versatile", client=None):
        if client is not None:
            self.client = client
        else:
            from groq import Groq

            self.client = Groq()
        self.model = model
        self._last_call_at: float | None = None

    def _wait_for_rate_limit(self) -> None:
        import time

        if self._last_call_at is not None:
            elapsed = time.monotonic() - self._last_call_at
            remaining = self.MIN_INTERVAL_SECONDS - elapsed
            if remaining > 0:
                time.sleep(remaining)
        self._last_call_at = time.monotonic()

    def score(self, resume_text: str, job: Job) -> ScoreResult:
        self._wait_for_rate_limit()

        prompt = _FIT_PROMPT.format(
            resume=_clean_for_prompt(resume_text, _MAX_RESUME_CHARS),
            title=job.title,
            company=job.company,
            jd=_clean_for_prompt(job.description, _MAX_JD_CHARS),
        )
        response = self.client.chat.completions.create(
            model=self.model,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content or ""
        data = _extract_json(text)
        return ScoreResult(
            fit_score=float(data.get("fit_score", 0.0)),
            missing_skills=list(data.get("missing_skills", [])),
            reasons=list(data.get("reasons", [])),
        )


def _extract_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError(f"Could not find JSON in scorer response: {text!r}")
    return json.loads(match.group(0))


def get_scorer(name: str, skills: list[str] | None = None) -> Scorer:
    if name == "local":
        return LocalScorer(skills=skills)
    if name == "claude":
        return ClaudeScorer()
    if name == "groq":
        return GroqScorer()
    raise ValueError(f"Unknown scorer: {name!r} (expected 'local', 'claude', or 'groq')")

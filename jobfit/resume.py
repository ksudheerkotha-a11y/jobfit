"""Load a resume file (.txt/.md/.pdf) down to plain text."""

from __future__ import annotations

from pathlib import Path


def load_resume(path: str | Path) -> str:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Resume not found: {p}")

    suffix = p.suffix.lower()
    if suffix in (".txt", ".md"):
        return p.read_text(encoding="utf-8", errors="ignore")
    if suffix == ".pdf":
        return _load_pdf(p)

    raise ValueError(f"Unsupported resume format: {suffix} (use .txt, .md, or .pdf)")


def _load_pdf(p: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(p))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages)

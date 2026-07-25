# jobfit — fewer, better, *real* job matches

A discovery + fit-gating engine for job seekers. It pulls live roles from public
ATS feeds, filters out stale/ghost listings, scores each role against your
resume, and returns a **short, ranked shortlist you actually fit** — instead of
a spray list. The thesis: interview rate goes *up* when application volume goes
*down* and targeting goes up.

This is the clean, legal core (Greenhouse + Lever public JSON feeds — no auth,
no scraping, no captcha). The brittle auto-apply plumbing is deliberately *not*
here; prove the "fewer, better" thesis first.

## Quickstart

```bash
pip install -r requirements.txt

# See the whole pipeline run offline against fixtures (no network needed):
python run_demo.py

# Run against LIVE company boards:
cp config.example.yaml config.yaml   # edit in the companies you care about
python -m jobfit run --resume your_resume.pdf --config config.yaml \
    --min-fit 0.35 --max-age-days 30 --top 15 --out matches.json
```

## How it works

```
fetch (Greenhouse + Lever)  ->  drop stale  ->  drop ghost/low-signal
     ->  dedupe  ->  score fit (resume x JD)  ->  gate on fit  ->  rank
```

| Stage        | File                     | What it does                                            |
|--------------|--------------------------|---------------------------------------------------------|
| Sources      | `jobfit/sources/*.py`    | Public ATS feeds -> normalized `Job` objects            |
| Resume       | `jobfit/resume.py`       | Load `.txt/.md/.pdf` to text                            |
| Filters      | `jobfit/filters.py`      | Freshness, ghost heuristic, dedupe, fit gating          |
| Scoring      | `jobfit/scoring.py`      | `local` (TF-IDF + skill coverage) or `claude` (API)     |
| Pipeline/CLI | `jobfit/pipeline.py`,`cli.py` | Orchestration + ranked table output               |

**Fit score** blends TF-IDF cosine similarity (resume vs JD) with explicit
skill-coverage, and surfaces `missing_skills` — the JD terms your resume lacks,
which is exactly the input the later "tailor the resume" step needs.

## Getting board tokens

There's no public directory. A Greenhouse token is the slug in
`boards.greenhouse.io/<token>`; a Lever slug is in `jobs.lever.co/<slug>`. Curate
20–40 companies in your target space — precision beats a huge list.

## Extending

- **More sources**: Ashby, Workable, Recruitee, and Personio also expose public
  feeds. Add a `jobfit/sources/ashby.py` returning `Job` objects and register it
  in `sources/__init__.py._FETCHERS`. Same shape, ~20 lines each.
- **Better scoring**: `--scorer claude` (set `ANTHROPIC_API_KEY`, `pip install
  anthropic`) for genuine semantic judgement instead of keyword overlap.
- **The next module (the real differentiator)**: a *human-path* step — check the
  user's own network for a connection at each shortlisted company and draft the
  referral ask. A warm intro is worth 4–10x a cold apply; that's the wedge.

## Deploy: GitHub Actions (engine) + Supabase (data) + Vercel (frontend)

The Python engine runs as a scheduled batch on **GitHub Actions** and writes to
**Supabase**. A **Next.js/Vercel** frontend then just reads `matches`. Two
workloads, split on purpose:

```
GitHub Actions (cron, every 6h)          Supabase (Postgres)        Vercel (Next.js)
  ingest.py  fetch->filter->store  ─────▶  jobs                 ┐
  match.py   score->gate->store    ─────▶  matches  ◀───────────┼── reads shortlist
                                           resumes  ◀────────────┘   (RLS per user)
```

**1. Supabase** — run `supabase_schema.sql` in the SQL editor. Grab your project
URL and the **service_role** key (server-side only — never ship it to the browser).

**2. Try the writes locally in dry-run** (prints payloads, writes nothing):

```bash
JOBFIT_DRY_RUN=1 python ingest.py --config config.yaml
JOBFIT_DRY_RUN=1 python match.py --scorer local
```

Then for real, set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` and drop the flag.

**3. GitHub Actions** — the engine ships with `.github/workflows/ingest.yml`
(runs `ingest.py` then `match.py` every 6h). Add repo secrets under
*Settings → Secrets and variables → Actions*:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | service_role key |
| `ANTHROPIC_API_KEY` | only if you run `match.py --scorer claude` |

Trigger a first run from the Actions tab (*workflow_dispatch*) to populate Supabase.

**4. Vercel frontend (next build)** — a Next.js app using the Supabase **anon**
key + Auth. A user's shortlist is one query, and RLS guarantees they only see
their own rows:

```ts
const { data } = await supabase
  .from('matches')
  .select('fit_score, missing_skills, reasons, status, jobs(title, company, location, apply_url, posted_at)')
  .order('fit_score', { ascending: false });
```

Resumes are per-user rows in `resumes`; the next batch run scores against them.

A minimal skeleton of this frontend lives in [`frontend/`](frontend/) — see
[`frontend/README.md`](frontend/README.md) for setup.

## Honest limitations (v0)

- Covers Greenhouse + Lever only. Big employers on Workday/Taleo need their own
  adapters (some have public feeds, some don't).
- The ghost filter is a light heuristic (description length). A stronger version
  tracks re-post history over time to catch true evergreen/ghost reqs.
- The local scorer is keyword-aware, not deeply semantic — good for a first cut
  and gating; use `--scorer claude` when match quality matters.
- No auto-apply. That's intentional: prove targeting quality first.

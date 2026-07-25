# jobfit frontend

Minimal Next.js skeleton that reads the shortlist the batch engine (see the
root README's Deploy section) writes to Supabase.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

## What's here

- Email + password signup/sign-in (Supabase Auth). Signup requires confirming
  a one-time email if your project has "Confirm email" enabled (Supabase
  default); sign-in after that needs no email round-trip, avoiding the strict
  rate limit on Supabase's default (dev-only) email sender — see "Auth email
  delivery" below if you expect real signup volume.
- A resume textarea that upserts into the `resumes` table, keyed to the
  signed-in user (`auth.uid()`), for the next scheduled `match.py` run to
  score against.
- A read of `matches` joined with `jobs`, ordered by fit score, matching the
  query in the root README's Deploy section. RLS in `supabase_schema.sql`
  guarantees a user only ever sees their own matches; `jobs` rows are public.

- An executive-dashboard layout: KPI stat tiles (shortlist size, avg fit, top
  match, companies represented), a fit-score meter and skill pills in the
  matches table, and a collapsible resume card. Colors and light/dark modes
  come from a validated palette (see `globals.css`).

## What's not here (yet)

- Marking a match as applied/dismissed (the `matches.status` column exists,
  nothing in the UI writes to it yet).
- Server-side rendering / auth cookies — this is a client-only skeleton using
  the browser Supabase client directly.

## Deploying to Vercel

This app lives in `frontend/`, not the repo root, so when importing the repo
on Vercel: set **Root Directory** to `frontend` (Settings → Build and
Deployment → Root Directory) before the first deploy, or Vercel's
auto-detection will find the Python engine at the repo root instead of this
Next.js app. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
as project environment variables. After deploying, add the production URL to
your Supabase project's Authentication → URL Configuration (Site URL and
Redirect URLs) or confirmation emails will redirect back to `localhost`.

## Auth email delivery

Supabase's default email sender is a shared, heavily rate-limited service
meant for development only — expect "email rate limit exceeded" under any
real signup volume. Before opening this up to other users, configure a
custom SMTP provider under Authentication → Emails → SMTP Settings (Resend,
Postmark, SendGrid, or a Gmail relay all work).

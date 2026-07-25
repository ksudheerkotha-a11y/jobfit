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

- Email magic-link auth (Supabase Auth) — no password handling in this app.
- A resume textarea that upserts into the `resumes` table, keyed to the
  signed-in user (`auth.uid()`), for the next scheduled `match.py` run to
  score against.
- A read of `matches` joined with `jobs`, ordered by fit score, matching the
  query in the root README's Deploy section. RLS in `supabase_schema.sql`
  guarantees a user only ever sees their own matches; `jobs` rows are public.

## What's not here (yet)

- Marking a match as applied/dismissed (the `matches.status` column exists,
  nothing in the UI writes to it yet).
- Any styling system — this is plain CSS, intentionally undecorated.
- Server-side rendering / auth cookies — this is a client-only skeleton using
  the browser Supabase client directly.

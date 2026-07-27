-- Auto Apply (config-only). Safe to re-run — every statement is
-- idempotent. Purely additive: two new tables, no existing table touched.
--
-- Design intent: "enabled" never triggers real submission — the app has
-- no ATS integration or browser automation to submit forms with, and
-- deliberately doesn't build one (account/ToS risk). What this actually
-- automates is *prep*: for matches at or above the user's quality bar,
-- the server drafts a cover letter + tailored resume ahead of time (same
-- Groq calls as the manual "Cover letter" / "Tailor resume" buttons) and
-- queues them for review. The user still clicks the job's real apply_url
-- and submits themselves; jobfit only saves them the drafting step.

-- ============================================================
-- 1. auto_apply_settings — one row per user
-- ============================================================
create table if not exists auto_apply_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  enabled            boolean not null default false,
  min_fit_score      numeric not null default 0.85,
  daily_cap          integer not null default 5,
  resume_version_id  bigint references resume_versions(id) on delete set null,
  updated_at         timestamptz not null default now()
);

-- ============================================================
-- 2. auto_apply_queue — one row per queued (match, draft) pair
-- ============================================================
-- unique(user_id, job_id): a match is only ever queued once, ever — so a
-- dismissed suggestion never resurfaces on the next run.
create table if not exists auto_apply_queue (
  id                     bigserial primary key,
  user_id                uuid not null references auth.users(id) on delete cascade,
  job_id                 text not null references jobs(id) on delete cascade,
  cover_letter_draft     text not null default '',
  tailored_resume_draft  text not null default '',
  status                 text not null default 'queued',
  created_at             timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists auto_apply_queue_user_status_idx
  on auto_apply_queue (user_id, status, created_at desc);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table auto_apply_settings enable row level security;
alter table auto_apply_queue enable row level security;

-- Full CRUD by owner: their own settings, end to end.
drop policy if exists "users manage their own auto-apply settings" on auto_apply_settings;
create policy "users manage their own auto-apply settings"
  on auto_apply_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Read + update only (mark applied/dismissed) — the drafts themselves are
-- system-written, same pattern as notifications.
drop policy if exists "users read their own auto-apply queue" on auto_apply_queue;
create policy "users read their own auto-apply queue"
  on auto_apply_queue for select
  using (auth.uid() = user_id);

drop policy if exists "users update their own auto-apply queue" on auto_apply_queue;
create policy "users update their own auto-apply queue"
  on auto_apply_queue for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

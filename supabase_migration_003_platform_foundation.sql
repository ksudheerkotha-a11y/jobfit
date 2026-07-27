-- Phase 1 foundation for the platform expansion. Safe to re-run — every
-- statement is idempotent. Additive only: no column is dropped, no type is
-- narrowed, no existing row is touched except one NOT NULL relaxation on
-- matches (see below), which is backwards-compatible.
--
-- Design intent, per table (why it exists beyond what Phase 1's UI uses):

-- ============================================================
-- 1. saved_jobs — lightweight bookmarks, deliberately separate from matches
-- ============================================================
-- matches = "the AI scored this, or I'm actively tracking it through my
-- pipeline." saved_jobs = "I'm interested, nothing more yet." A user may
-- save 100 jobs and only ever pursue 12 — conflating the two would make
-- "shortlist size" and funnel analytics (Phase 6) lie. Keeping them apart
-- now avoids a data migration later when that distinction starts to matter.
create table if not exists saved_jobs (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  job_id      text not null references jobs(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists saved_jobs_user_idx on saved_jobs (user_id, created_at desc);

-- ============================================================
-- 2. matches — relax fit_score, add the INSERT policy
-- ============================================================
-- Today only the service-role pipeline can create a match (no INSERT
-- policy exists for users). The Applications Kanban (Phase 4) needs to
-- track jobs a user is pursuing that the AI never scored — manually added
-- from search or from outside jobfit entirely. Those rows have no real
-- fit_score, hence the NOT NULL relax; existing pipeline-written rows are
-- untouched.
alter table matches alter column fit_score drop not null;

drop policy if exists "users insert their own matches" on matches;
create policy "users insert their own matches"
  on matches for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- 3. resume_versions — the resume table becomes one-to-many
-- ============================================================
-- ats_score and keywords are nullable and unused by Phase 1's UI, but
-- adding them now means resume comparison, ATS analytics, and keyword
-- tracking (Phase 5) are pure UI work later, not a migration. source_resume_id
-- lets a "tailored for this job" version point back at what it was tailored
-- from, without duplicating that lineage into a separate table.
create table if not exists resume_versions (
  id                bigserial primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  title             text not null default 'Untitled resume',
  version_name      text,
  resume_text       text not null,
  source_resume_id  bigint references resume_versions(id) on delete set null,
  ats_score         numeric,
  keywords          jsonb not null default '[]',
  is_default        boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists resume_versions_user_idx on resume_versions (user_id, created_at desc);

-- Only one default version per user — the app can always ask "give me the
-- default" without an ORDER BY / LIMIT 1 guess.
create unique index if not exists resume_versions_one_default_per_user
  on resume_versions (user_id)
  where is_default;

-- ============================================================
-- 4. cover_letters — what's generated today is thrown away; persist it
-- ============================================================
-- job_id is nullable and separate from job_title/company: a cover letter
-- can be for a real jobfit-tracked job (join for analytics later) or for
-- something entirely outside the pipeline (job_id null, title/company
-- free text) — both are real use cases, so neither is forced.
create table if not exists cover_letters (
  id                bigserial primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  job_id            text references jobs(id) on delete set null,
  job_title         text not null default '',
  company           text not null default '',
  tone              text not null default 'professional',
  prompt            text not null default '',
  generated_content text not null default '',
  edited_content    text,
  is_favourite      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists cover_letters_user_idx on cover_letters (user_id, created_at desc);

-- ============================================================
-- 5. user_preferences — one row per user, Phase 1 uses it for filtering only
-- ============================================================
-- Explicitly NOT wired into the Python ingestion pipeline yet (see the
-- architecture note this migration was approved against) — this only
-- filters/ranks/personalises in the frontend and API routes for now.
-- Every array/range field is nullable so "no preference set" is just an
-- empty settings page, not a broken query.
create table if not exists user_preferences (
  id                  bigserial primary key,
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  preferred_locations text[] not null default '{}',
  preferred_titles    text[] not null default '{}',
  preferred_companies text[] not null default '{}',
  preferred_skills    text[] not null default '{}',
  salary_min          numeric,
  salary_max          numeric,
  remote_only         boolean not null default false,
  -- free text on purpose, not an enum — avoids a check-constraint migration
  -- if the vocabulary needs to grow later
  experience_level    text,
  employment_type     text,
  updated_at          timestamptz not null default now()
);

-- ============================================================
-- 6. interviews — table now, UI later (Phase 7)
-- ============================================================
-- job_id nullable for the same reason as cover_letters: an interview can be
-- for a jobfit-tracked job or one entirely outside it.
create table if not exists interviews (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  job_id        text references jobs(id) on delete set null,
  company       text not null default '',
  role          text not null default '',
  -- free text: phone_screen | onsite | final | offer_call | ... — not
  -- constrained yet, same reasoning as experience_level above
  stage         text not null default 'phone_screen',
  scheduled_at  timestamptz,
  meeting_link  text,
  notes         text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists interviews_user_upcoming_idx
  on interviews (user_id, scheduled_at)
  where scheduled_at is not null;

-- ============================================================
-- 7. notifications — system-written, user-read
-- ============================================================
-- Unlike the tables above, a user should never be able to INSERT their own
-- notification (that would let them fake a "you got an offer!" toast) —
-- only service_role writes these. Users can only read and mark-as-read.
create table if not exists notifications (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- follow_up_due | interview_reminder | resume_suggestion | weekly_summary
  -- | status_changed | ... — free text, same reasoning as stage/experience_level
  type        text not null,
  title       text not null,
  body        text not null default '',
  is_read     boolean not null default false,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on notifications (user_id, is_read, created_at desc);

-- ============================================================
-- 8. activity_log — append-only audit trail, foundational for Phase 2/6
-- ============================================================
-- entity_id is deliberately NOT a foreign key: it points at different
-- tables depending on entity_type (jobs.id is text, matches/resume_versions/
-- interviews use bigint ids) — a single typed FK can't span that, which is
-- the standard trade-off for a polymorphic log. Indexed instead, on both
-- the per-entity-timeline access pattern and the recent-activity-feed one.
create table if not exists activity_log (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- application | resume_version | cover_letter | interview | job | ...
  entity_type text not null,
  entity_id   text not null,
  -- status_changed | resume_uploaded | applied | note_added | ...
  action      text not null,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists activity_log_user_recent_idx on activity_log (user_id, created_at desc);
create index if not exists activity_log_entity_idx on activity_log (user_id, entity_type, entity_id);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table saved_jobs enable row level security;
alter table resume_versions enable row level security;
alter table cover_letters enable row level security;
alter table user_preferences enable row level security;
alter table interviews enable row level security;
alter table notifications enable row level security;
alter table activity_log enable row level security;

-- Full CRUD by owner: these are the user's own data end to end.
drop policy if exists "users manage their own saved jobs" on saved_jobs;
create policy "users manage their own saved jobs"
  on saved_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage their own resume versions" on resume_versions;
create policy "users manage their own resume versions"
  on resume_versions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage their own cover letters" on cover_letters;
create policy "users manage their own cover letters"
  on cover_letters for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage their own preferences" on user_preferences;
create policy "users manage their own preferences"
  on user_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage their own interviews" on interviews;
create policy "users manage their own interviews"
  on interviews for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Append-only from the client: insert and read, never update or delete —
-- an audit log a user can edit isn't an audit log.
drop policy if exists "users insert their own activity" on activity_log;
create policy "users insert their own activity"
  on activity_log for insert
  with check (auth.uid() = user_id);

drop policy if exists "users read their own activity" on activity_log;
create policy "users read their own activity"
  on activity_log for select
  using (auth.uid() = user_id);

-- Read + mark-as-read only. No insert/delete policy for users on purpose —
-- only the service_role key (which bypasses RLS) creates notifications.
drop policy if exists "users read their own notifications" on notifications;
create policy "users read their own notifications"
  on notifications for select
  using (auth.uid() = user_id);

drop policy if exists "users update their own notifications" on notifications;
create policy "users update their own notifications"
  on notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- jobfit Supabase schema. Run once in the SQL editor of a fresh project.
--
-- jobs    : written by ingest.py (service_role), read by everyone (public listings).
-- resumes : one row per user, written by the user themselves via the frontend.
-- matches : written by match.py (service_role), read only by the owning user.

create table if not exists jobs (
  id           text primary key,          -- "<source>:<company>:<external_id>"
  source       text not null,
  external_id  text not null,
  company      text not null,
  title        text not null,
  location     text not null default '',
  description  text not null default '',
  apply_url    text not null default '',
  posted_at    date,
  department   text,
  created_at   timestamptz not null default now()
);

create table if not exists resumes (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  resume_text  text not null,
  updated_at   timestamptz not null default now()
);

create table if not exists matches (
  id              bigserial primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  job_id          text not null references jobs(id) on delete cascade,
  -- nullable: a pipeline-scored match always has one, but a user manually
  -- tracking a job the AI never saw (Applications Kanban) won't
  fit_score       numeric,
  missing_skills  text[] not null default '{}',
  reasons         text[] not null default '{}',
  -- new | applied | phone_screen | onsite | offer | rejected | dismissed
  status          text not null default 'new',
  notes           text not null default '',
  applied_at      timestamptz,  -- set once, the first time status leaves 'new'
  created_at      timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists matches_user_fit_idx on matches (user_id, fit_score desc);

-- Self-reported network for referral matching: "I know someone at Stripe."
-- There's no LinkedIn/contacts-import integration — the user types these in
-- themselves, and the app cross-references company names against the
-- shortlist. See README for why an automated version isn't here.
create table if not exists contacts (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  company     text not null,
  context     text not null default '',  -- how they know them, role, etc.
  created_at  timestamptz not null default now()
);

create index if not exists contacts_user_company_idx on contacts (user_id, company);

-- Platform foundation (Phase 1). See supabase_migration_003_platform_foundation.sql
-- for the per-table design rationale — kept there rather than duplicated here.

create table if not exists saved_jobs (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  job_id      text not null references jobs(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists saved_jobs_user_idx on saved_jobs (user_id, created_at desc);

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

create unique index if not exists resume_versions_one_default_per_user
  on resume_versions (user_id)
  where is_default;

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

-- Filters/ranks/personalises in the frontend and API routes only — not
-- wired into the Python ingestion pipeline (see README).
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
  experience_level    text,
  employment_type     text,
  updated_at          timestamptz not null default now()
);

create table if not exists interviews (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  job_id        text references jobs(id) on delete set null,
  company       text not null default '',
  role          text not null default '',
  stage         text not null default 'phone_screen',
  scheduled_at  timestamptz,
  meeting_link  text,
  notes         text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists interviews_user_upcoming_idx
  on interviews (user_id, scheduled_at)
  where scheduled_at is not null;

-- System-written (service_role), user-read/mark-as-read only — see RLS below.
create table if not exists notifications (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text not null default '',
  is_read     boolean not null default false,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on notifications (user_id, is_read, created_at desc);

-- Append-only audit trail. entity_id is deliberately not a foreign key —
-- entity_type discriminates which table it points at, and those tables
-- don't share an id type (jobs.id is text; the rest are bigint).
create table if not exists activity_log (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id   text not null,
  action      text not null,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists activity_log_user_recent_idx on activity_log (user_id, created_at desc);
create index if not exists activity_log_entity_idx on activity_log (user_id, entity_type, entity_id);

-- Row Level Security. The service_role key (used by ingest.py / match.py)
-- bypasses RLS entirely, so batch writes are unaffected by the policies below.

alter table jobs enable row level security;
alter table resumes enable row level security;
alter table matches enable row level security;
alter table contacts enable row level security;
alter table saved_jobs enable row level security;
alter table resume_versions enable row level security;
alter table cover_letters enable row level security;
alter table user_preferences enable row level security;
alter table interviews enable row level security;
alter table notifications enable row level security;
alter table activity_log enable row level security;

-- Job listings are not sensitive; anyone (including the frontend's anon key)
-- can read them. Only the service_role key can write.
create policy "jobs are publicly readable"
  on jobs for select
  using (true);

-- Users can only see/manage their own resume.
create policy "users manage their own resume"
  on resumes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can only see and update their own matches (e.g. marking status).
create policy "users read their own matches"
  on matches for select
  using (auth.uid() = user_id);

create policy "users update their own matches"
  on matches for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Manually tracking a job the pipeline never scored (Applications Kanban).
create policy "users insert their own matches"
  on matches for insert
  with check (auth.uid() = user_id);

-- Users fully own their contacts list.
create policy "users manage their own contacts"
  on contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Full CRUD by owner: these are the user's own data end to end.
create policy "users manage their own saved jobs"
  on saved_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage their own resume versions"
  on resume_versions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage their own cover letters"
  on cover_letters for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage their own preferences"
  on user_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage their own interviews"
  on interviews for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Append-only from the client: insert and read, never update or delete —
-- an audit log a user can edit isn't an audit log.
create policy "users insert their own activity"
  on activity_log for insert
  with check (auth.uid() = user_id);

create policy "users read their own activity"
  on activity_log for select
  using (auth.uid() = user_id);

-- Read + mark-as-read only. No insert/delete policy for users — only the
-- service_role key (which bypasses RLS) creates notifications.
create policy "users read their own notifications"
  on notifications for select
  using (auth.uid() = user_id);

create policy "users update their own notifications"
  on notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

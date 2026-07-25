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
  fit_score       numeric not null,
  missing_skills  text[] not null default '{}',
  reasons         text[] not null default '{}',
  status          text not null default 'new',  -- new | seen | applied | dismissed
  created_at      timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists matches_user_fit_idx on matches (user_id, fit_score desc);

-- Row Level Security. The service_role key (used by ingest.py / match.py)
-- bypasses RLS entirely, so batch writes are unaffected by the policies below.

alter table jobs enable row level security;
alter table resumes enable row level security;
alter table matches enable row level security;

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

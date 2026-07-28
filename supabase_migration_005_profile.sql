-- Profile page. Safe to re-run — every statement is idempotent. Purely
-- additive: four new tables, no existing table touched.
--
-- Design intent: "application defaults" (work authorization, relocation,
-- background) are captured now so a future real ATS-autofill integration
-- has real data to read — jobfit doesn't submit anything with them today,
-- same as every other "table now, capability later" table in this schema.
-- Education/experience dates are free text ("2020", "Jun 2022", "Present")
-- rather than a date type, since resumes rarely give full ISO dates.

-- ============================================================
-- 1. profile — one row per user: identity + application defaults
-- ============================================================
create table if not exists profile (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  full_name             text not null default '',
  open_to_work          boolean not null default true,
  location              text not null default '',
  phone                 text not null default '',
  professional_summary  text not null default '',
  work_authorized       boolean not null default false,
  needs_sponsorship     boolean not null default false,
  in_person_ok          boolean not null default false,
  can_relocate          boolean not null default false,
  start_immediately     boolean not null default false,
  has_transport         boolean not null default false,
  needs_accommodations  boolean not null default false,
  prior_employee        boolean not null default false,
  gov_clearance         boolean not null default false,
  gov_ties              boolean not null default false,
  updated_at            timestamptz not null default now()
);

-- ============================================================
-- 2. profile_education
-- ============================================================
create table if not exists profile_education (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  school      text not null default '',
  degree      text not null default '',
  field       text not null default '',
  start_date  text not null default '',
  end_date    text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists profile_education_user_idx on profile_education (user_id, sort_order);

-- ============================================================
-- 3. profile_experience
-- ============================================================
create table if not exists profile_experience (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  company     text not null default '',
  location    text not null default '',
  start_date  text not null default '',
  end_date    text not null default '',
  bullets     text[] not null default '{}',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists profile_experience_user_idx on profile_experience (user_id, sort_order);

-- ============================================================
-- 4. profile_skills — one row per skill, not a text[] column, so the UI
-- can group/reorder by category and add/remove a single skill without
-- rewriting a whole array.
-- ============================================================
create table if not exists profile_skills (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null default 'Skills',
  skill       text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists profile_skills_user_idx on profile_skills (user_id, category, sort_order);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table profile enable row level security;
alter table profile_education enable row level security;
alter table profile_experience enable row level security;
alter table profile_skills enable row level security;

drop policy if exists "users manage their own profile" on profile;
create policy "users manage their own profile"
  on profile for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage their own education" on profile_education;
create policy "users manage their own education"
  on profile_education for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage their own experience" on profile_experience;
create policy "users manage their own experience"
  on profile_experience for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage their own skills" on profile_skills;
create policy "users manage their own skills"
  on profile_skills for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

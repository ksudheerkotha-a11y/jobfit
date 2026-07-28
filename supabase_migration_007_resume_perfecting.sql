-- Perfecting the Resume document: adds what was missing when compared
-- directly against a real resume — a LinkedIn field (the contact line was
-- already missing nothing else; email comes from auth.users, not stored
-- here) and a Projects section, which resumes conventionally have and the
-- structured template had no way to represent. Safe to re-run — every
-- statement is idempotent, purely additive.

alter table profile add column if not exists linkedin_url text not null default '';

-- Side/independent work distinct from paid employment — kept separate
-- from profile_experience rather than folded in, since resumes
-- conventionally give projects their own section with different fields
-- (a link, no company/location).
create table if not exists profile_projects (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null default '',
  description  text not null default '',
  link         text not null default '',
  bullets      text[] not null default '{}',
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists profile_projects_user_idx on profile_projects (user_id, sort_order);

alter table profile_projects enable row level security;

drop policy if exists "users manage their own projects" on profile_projects;
create policy "users manage their own projects"
  on profile_projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Migration for an already-provisioned jobfit database (run once in the SQL
-- editor). Adds pipeline-tracking columns to `matches` and a new `contacts`
-- table for the referral finder. Safe to re-run — every statement is
-- idempotent. A fresh install can skip this: supabase_schema.sql already
-- includes everything here.

alter table matches add column if not exists notes text not null default '';
alter table matches add column if not exists applied_at timestamptz;

create table if not exists contacts (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  company     text not null,
  context     text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists contacts_user_company_idx on contacts (user_id, company);

alter table contacts enable row level security;

drop policy if exists "users manage their own contacts" on contacts;
create policy "users manage their own contacts"
  on contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

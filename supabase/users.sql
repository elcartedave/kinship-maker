-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- It is idempotent: re-running it updates the existing public.users table
-- with the required profile columns and row-level security policies.

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  email text,
  name text,
  image_url text
);

alter table public.users
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists nickname text,
  add column if not exists age integer,
  add column if not exists sex_assigned_at_birth text;

alter table public.users
  alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_age_reasonable'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_age_reasonable
      check (age is null or (age >= 1 and age <= 130))
      not valid;
  end if;
end $$;

alter table public.users validate constraint users_age_reasonable;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_sex_assigned_at_birth_valid'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_sex_assigned_at_birth_valid
      check (sex_assigned_at_birth is null or sex_assigned_at_birth in ('male', 'female'))
      not valid;
  end if;
end $$;

alter table public.users validate constraint users_sex_assigned_at_birth_valid;

alter table public.users enable row level security;

drop policy if exists "Users read their own profile" on public.users;
drop policy if exists "Users insert their own profile" on public.users;
drop policy if exists "Users update their own profile" on public.users;

create policy "Users read their own profile"
on public.users
for select
using (auth.uid() = id);

create policy "Users insert their own profile"
on public.users
for insert
with check (auth.uid() = id);

create policy "Users update their own profile"
on public.users
for update
using (auth.uid() = id)
with check (auth.uid() = id);

notify pgrst, 'reload schema';

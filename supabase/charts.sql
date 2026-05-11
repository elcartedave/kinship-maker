-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query).
-- It is idempotent: re-running it will not error if the table or policy
-- already exists.

create table if not exists public.charts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Untitled chart',
  document jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.charts enable row level security;

drop policy if exists "Users manage only their charts" on public.charts;

create policy "Users manage only their charts"
on public.charts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Force PostgREST to refresh its schema cache so the REST endpoint sees the
-- new table immediately (otherwise the client gets PGRST205: "Could not find
-- the table 'public.charts' in the schema cache").
notify pgrst, 'reload schema';

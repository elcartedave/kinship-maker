-- Create users table
create table if not exists public.users (
    id uuid primary key references auth.users (id) on delete cascade,
    email text unique,
    name text,
    image_url text,
    updated_at timestamptz not null default now()
);

-- Automatically create user row in public.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, image_url, name)
	values (
		new.id,
		new.email,
		new.raw_user_meta_data->>'avatar_url',
		new.raw_user_meta_data->>'full_name'
	);

  return new;
end;
$$;

-- Create trigger
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Enable RLS
alter table public.users enable row level security;

-- Everyone can view user profiles
drop policy if exists "Anyone can view profiles" on public.users;

create policy "Anyone can view profiles"
on public.users
for select
using (true);

-- Users can insert only their own profile
drop policy if exists "Users can insert own profile" on public.users;

create policy "Users can insert own profile"
on public.users
for insert
with check (auth.uid() = id);

-- Users can update only their own profile
drop policy if exists "Users can update own profile" on public.users;

create policy "Users can update own profile"
on public.users
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Users can delete only their own profile
drop policy if exists "Users can delete own profile" on public.users;

create policy "Users can delete own profile"
on public.users
for delete
using (auth.uid() = id);
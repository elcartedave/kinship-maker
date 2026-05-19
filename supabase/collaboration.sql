-- Run this after users.sql and charts.sql.
-- Adds shared chart membership, node-to-user links, and approval invitations.

create table if not exists public.chart_members (
  chart_id uuid not null references public.charts (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  ego_node_id text,
  invited_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (chart_id, user_id)
);

create table if not exists public.kinship_node_invitations (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references public.charts (id) on delete cascade,
  node_id text not null,
  inviter_id uuid not null references public.users (id) on delete cascade,
  invitee_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists kinship_node_invitations_one_pending_node
on public.kinship_node_invitations (chart_id, node_id)
where status = 'pending';

create unique index if not exists kinship_node_invitations_one_pending_invitee
on public.kinship_node_invitations (chart_id, invitee_id)
where status = 'pending';

create table if not exists public.kinship_node_user_links (
  chart_id uuid not null references public.charts (id) on delete cascade,
  node_id text not null,
  user_id uuid not null references public.users (id) on delete cascade,
  invitation_id uuid references public.kinship_node_invitations (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (chart_id, node_id)
);

create unique index if not exists kinship_node_user_links_one_node_per_user
on public.kinship_node_user_links (chart_id, user_id);

alter table public.chart_members enable row level security;
alter table public.kinship_node_invitations enable row level security;
alter table public.kinship_node_user_links enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chart_members'
  ) then
    alter publication supabase_realtime add table public.chart_members;
  end if;
end $$;

create or replace function public.is_chart_member(target_chart_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chart_members m
    where m.chart_id = target_chart_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_chart_owner(target_chart_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.charts c
    where c.id = target_chart_id
      and c.user_id = auth.uid()
  );
$$;

create or replace function public.chart_owner_id(target_chart_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.user_id
  from public.charts c
  where c.id = target_chart_id;
$$;

create or replace function public.chart_has_other_members(target_chart_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chart_members m
    where m.chart_id = target_chart_id
      and m.user_id <> auth.uid()
  );
$$;

drop policy if exists "Authenticated users can find profiles" on public.users;
create policy "Authenticated users can find profiles"
on public.users
for select
to authenticated
using (true);

drop policy if exists "Members read chart memberships" on public.chart_members;
drop policy if exists "Owners manage memberships" on public.chart_members;
drop policy if exists "Members leave charts" on public.chart_members;

create policy "Members read chart memberships"
on public.chart_members
for select
using (
  user_id = auth.uid()
  or public.is_chart_member(chart_members.chart_id)
);

create policy "Owners manage memberships"
on public.chart_members
for all
using (
  public.is_chart_owner(chart_members.chart_id)
)
with check (
  public.is_chart_owner(chart_members.chart_id)
);

create policy "Members leave charts"
on public.chart_members
for delete
using (user_id = auth.uid() and role <> 'owner');

drop policy if exists "Members read invitations" on public.kinship_node_invitations;
drop policy if exists "Members create invitations" on public.kinship_node_invitations;
drop policy if exists "Invited users update invitations" on public.kinship_node_invitations;

create policy "Members read invitations"
on public.kinship_node_invitations
for select
using (
  invitee_id = auth.uid()
  or inviter_id = auth.uid()
  or public.is_chart_member(kinship_node_invitations.chart_id)
);

create policy "Members create invitations"
on public.kinship_node_invitations
for insert
with check (
  inviter_id = auth.uid()
  and invitee_id <> auth.uid()
  and public.is_chart_member(kinship_node_invitations.chart_id)
);

create policy "Invited users update invitations"
on public.kinship_node_invitations
for update
using (invitee_id = auth.uid() or inviter_id = auth.uid())
with check (invitee_id = auth.uid() or inviter_id = auth.uid());

drop policy if exists "Members read node links" on public.kinship_node_user_links;
create policy "Members read node links"
on public.kinship_node_user_links
for select
using (
  public.is_chart_member(kinship_node_user_links.chart_id)
  or public.is_chart_owner(kinship_node_user_links.chart_id)
);

drop policy if exists "Owners create node links" on public.kinship_node_user_links;
create policy "Owners create node links"
on public.kinship_node_user_links
for insert
with check (public.is_chart_owner(chart_id));

drop policy if exists "Users manage only their charts" on public.charts;
drop policy if exists "Chart members read charts" on public.charts;
drop policy if exists "Chart members update charts" on public.charts;
drop policy if exists "Owners insert charts" on public.charts;
drop policy if exists "Owners delete charts" on public.charts;

create policy "Chart members read charts"
on public.charts
for select
using (
  user_id = auth.uid()
  or public.is_chart_member(charts.id)
);

create policy "Chart members update charts"
on public.charts
for update
using (
  user_id = auth.uid()
  or public.is_chart_member(charts.id)
)
with check (
  user_id = public.chart_owner_id(id)
);

create policy "Owners insert charts"
on public.charts
for insert
with check (user_id = auth.uid());

create policy "Owners delete charts"
on public.charts
for delete
using (user_id = auth.uid());

create or replace function public.validate_kinship_node_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'pending' then
    return new;
  end if;

  if exists (
    select 1
    from public.kinship_node_user_links l
    where l.chart_id = new.chart_id
      and l.node_id = new.node_id
  ) then
    raise exception 'This node is already linked to an account';
  end if;

  if exists (
    select 1
    from public.kinship_node_user_links l
    where l.chart_id = new.chart_id
      and l.user_id = new.invitee_id
  ) then
    raise exception 'This account is already linked to another node in this chart';
  end if;

  if exists (
    select 1
    from public.kinship_node_invitations i
    where i.chart_id = new.chart_id
      and i.status = 'pending'
      and i.id <> new.id
      and (i.node_id = new.node_id or i.invitee_id = new.invitee_id)
  ) then
    raise exception 'This node or account already has a pending invitation';
  end if;

  return new;
end;
$$;

drop trigger if exists kinship_node_invitations_validate on public.kinship_node_invitations;
create trigger kinship_node_invitations_validate
before insert or update on public.kinship_node_invitations
for each row execute function public.validate_kinship_node_invitation();

-- Repair helper for existing rows created before the node-link flow was fully
-- wired. It keeps chart membership and node-user links consistent:
-- 1. approved invitations have a matching member row and node link
-- 2. members with ego_node_id have a matching node link
-- 3. owner rows are marked owner
create or replace function public.repair_kinship_collaboration_links()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.kinship_node_user_links l
  using public.kinship_node_invitations i
  where i.status = 'approved'
    and i.chart_id = l.chart_id
    and i.invitee_id = l.user_id
    and i.node_id <> l.node_id;

  insert into public.chart_members (chart_id, user_id, role, ego_node_id, invited_by)
  select chart_id, invitee_id, 'editor', node_id, inviter_id
  from public.kinship_node_invitations
  where status = 'approved'
  on conflict (chart_id, user_id) do update
    set ego_node_id = coalesce(chart_members.ego_node_id, excluded.ego_node_id),
        invited_by = coalesce(chart_members.invited_by, excluded.invited_by),
        updated_at = now();

  insert into public.kinship_node_user_links (chart_id, node_id, user_id, invitation_id)
  select chart_id, node_id, invitee_id, id
  from public.kinship_node_invitations
  where status = 'approved'
  on conflict (chart_id, node_id) do update
    set user_id = excluded.user_id,
        invitation_id = excluded.invitation_id;

  delete from public.kinship_node_user_links l
  using public.chart_members m
  where m.ego_node_id is not null
    and m.chart_id = l.chart_id
    and m.user_id = l.user_id
    and m.ego_node_id <> l.node_id;

  insert into public.kinship_node_user_links (chart_id, node_id, user_id)
  select chart_id, ego_node_id, user_id
  from public.chart_members
  where ego_node_id is not null
  on conflict (chart_id, node_id) do update
    set user_id = excluded.user_id;

  update public.chart_members m
  set role = 'owner',
      updated_at = now()
  from public.charts c
  where c.id = m.chart_id
    and c.user_id = m.user_id
    and m.role <> 'owner';
end;
$$;

create or replace function public.ensure_chart_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chart_members (chart_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (chart_id, user_id) do update
    set role = 'owner',
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists charts_ensure_owner_member on public.charts;
create trigger charts_ensure_owner_member
after insert on public.charts
for each row execute function public.ensure_chart_owner_member();

insert into public.chart_members (chart_id, user_id, role)
select id, user_id, 'owner'
from public.charts
on conflict (chart_id, user_id) do update
  set role = 'owner',
      updated_at = now();

create or replace function public.approve_kinship_node_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.kinship_node_invitations%rowtype;
begin
  select *
  into invite
  from public.kinship_node_invitations
  where id = invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if invite.invitee_id <> auth.uid() then
    raise exception 'Only the invited user can approve this invitation';
  end if;

  if invite.status <> 'pending' then
    raise exception 'Invitation is not pending';
  end if;

  update public.kinship_node_invitations
  set status = 'approved',
      updated_at = now()
  where id = invite.id;

  insert into public.chart_members (chart_id, user_id, role, ego_node_id, invited_by)
  values (invite.chart_id, invite.invitee_id, 'editor', invite.node_id, invite.inviter_id)
  on conflict (chart_id, user_id) do update
    set ego_node_id = excluded.ego_node_id,
        updated_at = now();

  delete from public.kinship_node_user_links
  where chart_id = invite.chart_id
    and (node_id = invite.node_id or user_id = invite.invitee_id);

  insert into public.kinship_node_user_links (chart_id, node_id, user_id, invitation_id)
  values (invite.chart_id, invite.node_id, invite.invitee_id, invite.id)
  on conflict (chart_id, node_id) do update
    set user_id = excluded.user_id,
        invitation_id = excluded.invitation_id;
end;
$$;

create or replace function public.reject_kinship_node_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.kinship_node_invitations
  set status = 'rejected',
      updated_at = now()
  where id = invitation_id
    and invitee_id = auth.uid()
    and status = 'pending';
end;
$$;

drop function if exists public.get_kinship_node_user_links(uuid);

create or replace function public.get_kinship_node_user_links(target_chart_id uuid)
returns table (
  node_id text,
  user_id uuid,
  label text,
  full_name text,
  age integer,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_chart_member(target_chart_id) or public.is_chart_owner(target_chart_id)) then
    raise exception 'Not authorized to view linked accounts';
  end if;

  return query
    select
      links.node_id,
      links.user_id,
      coalesce(users.nickname, users.name, users.email, 'Linked user') as label,
      ltrim(rtrim(concat_ws(' ', users.first_name, users.middle_name, users.last_name))) as full_name,
      users.age,
      'linked'::text as status
    from public.kinship_node_user_links links
    left join public.users users on users.id = links.user_id
    where links.chart_id = target_chart_id;

  return query
    select
      invitations.node_id,
      invitations.invitee_id as user_id,
      coalesce(users.nickname, users.name, users.email, 'Pending invitation') as label,
      ltrim(rtrim(concat_ws(' ', users.first_name, users.middle_name, users.last_name))) as full_name,
      users.age,
      'pending'::text as status
    from public.kinship_node_invitations invitations
    left join public.users users on users.id = invitations.invitee_id
    where invitations.chart_id = target_chart_id
      and invitations.status = 'pending';
end;
$$;

create or replace function public.unlink_kinship_node_user(
  target_chart_id uuid,
  target_node_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_user_id uuid;
  owner_id uuid;
begin
  select user_id
  into owner_id
  from public.charts
  where id = target_chart_id;

  if owner_id is null then
    raise exception 'Chart not found';
  end if;

  if owner_id <> auth.uid() then
    raise exception 'Only the chart owner can remove linked accounts';
  end if;

  select user_id
  into linked_user_id
  from public.kinship_node_user_links
  where chart_id = target_chart_id
    and node_id = target_node_id;

  if linked_user_id is null then
    return;
  end if;

  delete from public.kinship_node_user_links
  where chart_id = target_chart_id
    and node_id = target_node_id;

  update public.kinship_node_invitations
  set status = 'cancelled',
      updated_at = now()
  where chart_id = target_chart_id
    and node_id = target_node_id
    and invitee_id = linked_user_id
    and status in ('pending', 'approved');

  if linked_user_id <> owner_id then
    delete from public.chart_members
    where chart_id = target_chart_id
      and user_id = linked_user_id
      and role <> 'owner';
  else
    update public.chart_members
    set ego_node_id = null,
        updated_at = now()
    where chart_id = target_chart_id
      and user_id = linked_user_id;
  end if;
end;
$$;

create or replace function public.delete_owned_chart(target_chart_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  select user_id
  into owner_id
  from public.charts
  where id = target_chart_id;

  if owner_id is null then
    raise exception 'Chart not found';
  end if;

  if owner_id <> auth.uid() then
    raise exception 'Only the chart owner can delete this chart';
  end if;

  delete from public.charts
  where id = target_chart_id
    and user_id = auth.uid();
end;
$$;

select public.repair_kinship_collaboration_links();

notify pgrst, 'reload schema';

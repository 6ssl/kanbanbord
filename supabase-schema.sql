create table if not exists public.rooms (
  room_id text primary key check (room_id ~ '^[A-F0-9]{20}$'),
  board_state jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.rooms
  add column if not exists updated_by text;

create table if not exists public.room_members (
  room_id text not null references public.rooms(room_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (room_id, user_id)
);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;

create or replace function public.is_room_member(p_room_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

create or replace function public.create_room(p_board_state jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_room_id text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  new_room_id := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));
  insert into public.rooms (room_id, board_state, updated_by)
  values (new_room_id, p_board_state, auth.uid()::text);
  insert into public.room_members (room_id, user_id) values (new_room_id, auth.uid());
  return new_room_id;
end;
$$;

create or replace function public.join_room(p_room_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_room_id !~ '^[A-F0-9]{20}$' then
    raise exception 'Invalid room code';
  end if;
  if not exists (select 1 from public.rooms where room_id = p_room_id) then
    raise exception 'Room not found';
  end if;

  insert into public.room_members (room_id, user_id)
  values (p_room_id, auth.uid())
  on conflict (room_id, user_id) do nothing;
end;
$$;

drop policy if exists "Room members can view their rooms" on public.rooms;
create policy "Room members can view their rooms"
  on public.rooms for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "Room members can update their rooms" on public.rooms;
create policy "Room members can update their rooms"
  on public.rooms for update to authenticated
  using (public.is_room_member(room_id))
  with check (public.is_room_member(room_id));

drop policy if exists "Users can view their own room memberships" on public.room_members;
create policy "Users can view their own room memberships"
  on public.room_members for select to authenticated
  using (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, update on public.rooms to authenticated;
grant select on public.room_members to authenticated;
grant execute on function public.is_room_member(text) to authenticated;
grant execute on function public.create_room(jsonb) to authenticated;
grant execute on function public.join_room(text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end;
$$;

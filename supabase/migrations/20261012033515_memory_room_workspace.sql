-- Apply once to a Supabase project through SQL Editor or `supabase db push`.
begin;
create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;
create table public.workspace_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  owner_id uuid not null references auth.users(id),
  invite text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at bigint not null default (extract(epoch from now())*1000)::bigint
);
create table public.workspace_members (
  room_id uuid not null references public.workspace_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  last_seen bigint not null default (extract(epoch from now())*1000)::bigint,
  primary key(room_id,user_id)
);
create index workspace_members_user on public.workspace_members(user_id);
create table public.workspace_sections (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.workspace_rooms(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null default '' check (length(body)<=20000),
  kind text not null default 'note' check (kind in ('note','memory')),
  pinned integer not null default 0 check (pinned in (0,1)),
  memory_date text not null default '',
  author text not null, editor text not null,
  created_at bigint not null default (extract(epoch from now())*1000)::bigint,
  updated_at bigint not null default (extract(epoch from now())*1000)::bigint,
  version integer not null default 1 check (version>0)
);
create index workspace_sections_room on public.workspace_sections(room_id,created_at);
alter table public.workspace_rooms enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_sections enable row level security;

-- Membership helper avoids recursive RLS on the members table.
create function private.workspace_is_member(target text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workspace_members
    where room_id=case when target ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then target::uuid else null end
    and user_id=(select auth.uid()));
$$;
revoke all on function private.workspace_is_member(text) from public,anon;
grant execute on function private.workspace_is_member(text) to authenticated;
create policy rooms_read on public.workspace_rooms for select to authenticated using (private.workspace_is_member(id::text));
create policy members_read on public.workspace_members for select to authenticated using (private.workspace_is_member(room_id::text));
create policy sections_read on public.workspace_sections for select to authenticated using (private.workspace_is_member(room_id::text));
revoke all on public.workspace_rooms,public.workspace_members,public.workspace_sections from anon,authenticated;
-- Hide invite codes from ordinary room reads; only the owner RPC reveals them.
grant select(id,name,owner_id,created_at) on public.workspace_rooms to authenticated;
grant select on public.workspace_members,public.workspace_sections to authenticated;

create function private.workspace_rooms() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'owner_id',r.owner_id,
    'invite',case when r.owner_id=auth.uid() then r.invite else null end) order by r.created_at),'[]'::jsonb)
  from public.workspace_rooms r join public.workspace_members m on m.room_id=r.id where m.user_id=auth.uid();
$$;

-- All writes go through this function. Room membership and versions are checked
-- inside PostgreSQL, including calls made directly outside the app.
create function private.workspace_action(input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  display_name text;
  target uuid;
  section_id uuid;
  action text := input->>'action';
  stamp bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  changed uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select left(coalesce(raw_user_meta_data->>'name',email,'Friend'),80) into display_name from auth.users where id=actor;
  if action='create' then
    if jsonb_typeof(input->'name') is distinct from 'string' or length(trim(input->>'name')) not between 1 and 60 then raise exception 'Workspace name must be 1–60 characters'; end if;
    insert into public.workspace_rooms(name,owner_id) values(trim(input->>'name'),actor) returning id into target;
    insert into public.workspace_members(room_id,user_id,name,last_seen) values(target,actor,display_name,stamp);
    return jsonb_build_object('roomId',target);
  elsif action='join' then
    if (input->>'invite') is null or (input->>'invite') !~ '^[a-f0-9]{32}$' then raise exception 'Enter the full 32-character invite code'; end if;
    select id into target from public.workspace_rooms where invite=input->>'invite';
    if target is null then raise exception 'Invite code not found'; end if;
    insert into public.workspace_members(room_id,user_id,name,last_seen) values(target,actor,display_name,stamp)
      on conflict(room_id,user_id) do update set name=excluded.name,last_seen=excluded.last_seen;
    return jsonb_build_object('roomId',target);
  end if;
  target := (input->>'roomId')::uuid;
  if not private.workspace_is_member(target::text) then raise exception 'You are not a member of this workspace' using errcode='42501'; end if;
  if action='heartbeat' then
    update public.workspace_members set last_seen=stamp,name=display_name where room_id=target and user_id=actor;
    return jsonb_build_object('ok',true);
  elsif action='rename' then
    if jsonb_typeof(input->'name') is distinct from 'string' or length(trim(input->>'name')) not between 1 and 60 then raise exception 'Workspace name must be 1–60 characters'; end if;
    update public.workspace_rooms set name=trim(input->>'name') where id=target;
    return jsonb_build_object('ok',true);
  elsif action in ('add','edit') then
    if jsonb_typeof(input->'title') is distinct from 'string' or length(trim(input->>'title')) not between 1 and 120 then raise exception 'Section title must be 1–120 characters'; end if;
    if jsonb_typeof(input->'body') is distinct from 'string' or length(input->>'body')>20000 then raise exception 'Section must be at most 20000 characters'; end if;
    if (input->>'kind') is null or (input->>'kind') not in ('note','memory') or jsonb_typeof(input->'pinned') is distinct from 'boolean' then raise exception 'Invalid section type'; end if;
    if coalesce(input->>'memoryDate','')<>'' then perform (input->>'memoryDate')::date; end if;
    if action='add' then
      insert into public.workspace_sections(room_id,title,body,kind,pinned,memory_date,author,editor,created_at,updated_at)
      values(target,trim(input->>'title'),input->>'body',input->>'kind',case when (input->>'pinned')::boolean then 1 else 0 end,coalesce(input->>'memoryDate',''),display_name,display_name,stamp,stamp) returning id into section_id;
      return jsonb_build_object('noteId',section_id);
    end if;
    update public.workspace_sections set title=trim(input->>'title'),body=input->>'body',kind=input->>'kind',
      pinned=case when (input->>'pinned')::boolean then 1 else 0 end,memory_date=coalesce(input->>'memoryDate',''),editor=display_name,updated_at=stamp,version=version+1
      where id=(input->>'noteId')::uuid and room_id=target and version=(input->>'version')::integer returning id into changed;
  elsif action='delete' then
    delete from public.workspace_sections where id=(input->>'noteId')::uuid and room_id=target and version=(input->>'version')::integer returning id into changed;
  else raise exception 'Unknown action';
  end if;
  if changed is null then raise exception 'Someone changed or deleted this section. Your draft is kept on this device.' using errcode='40001'; end if;
  return jsonb_build_object('noteId',changed);
end;
$$;
revoke all on function private.workspace_rooms(),private.workspace_action(jsonb) from public,anon;
grant execute on function private.workspace_rooms(),private.workspace_action(jsonb) to authenticated;
-- Expose invoker-only RPC entrypoints; privileged implementations stay private.
create function public.workspace_rooms() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.workspace_rooms();
$$;
create function public.workspace_action(input jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.workspace_action(input);
$$;
revoke all on function public.workspace_rooms(),public.workspace_action(jsonb) from public,anon;
grant execute on function public.workspace_rooms(),public.workspace_action(jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('workspace-files','workspace-files',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain']);
create policy workspace_files_read on storage.objects for select to authenticated
  using(bucket_id='workspace-files' and private.workspace_is_member((storage.foldername(name))[1]));
create policy workspace_files_insert on storage.objects for insert to authenticated
  with check(bucket_id='workspace-files' and private.workspace_is_member((storage.foldername(name))[1]));
create policy workspace_files_delete on storage.objects for delete to authenticated
  using(bucket_id='workspace-files' and owner_id=(select auth.uid())::text and private.workspace_is_member((storage.foldername(name))[1]));
commit;
